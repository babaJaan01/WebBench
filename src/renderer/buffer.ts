import { Partition } from "./partition";

export class Buffer {

    device: GPUDevice;

    deviceMemory: GPUBuffer;
    usage: number;
    size: number;

    coarse_partitions: Partition[];
    hostMemories: Float32Array[];

    fine_partitions: Partition[][];

    constructor(device: GPUDevice){
        this.device = device;
        this.usage = 0;

        this.size = 0;

        this.coarse_partitions = [];
        this.hostMemories = [];

        this.fine_partitions = [];
    }

    /**
     * Declare a new bindable resource to be stored on this buffer.
     * @param size size of resource (bytes)
     * @param usage usage of the resource
     * @returns the index of the resource within the buffer
     */
    add_coarse_partition(size: number, usage: number): number {

        let offset = this.size;
        this.size += size;
        this.usage |= usage;
        const limits = this.device.limits;
        console.log("Add Coarse Partition");
        if (usage & GPUBufferUsage.STORAGE) {
            const alignment = limits.minStorageBufferOffsetAlignment;
            const padding = (alignment - (offset & alignment - 1)) & alignment - 1;
            this.size += padding;
            offset += padding;
            console.log("Required Alignment: %d, Padding: %d", alignment, padding);
        }
        if (usage & GPUBufferUsage.UNIFORM) {
            const alignment = limits.minUniformBufferOffsetAlignment;
            const padding = (alignment - (offset & alignment - 1)) & alignment - 1;
            this.size += padding;
            offset += padding;
            console.log("Required Alignment: %d, Padding: %d", alignment, padding);
        }
        this.coarse_partitions.push(new Partition(offset, size, []));
        this.hostMemories.push(new Float32Array(size / 4));
        this.fine_partitions.push([]);

        return this.coarse_partitions.length - 1;
    }

    async Initialize() {

        const descriptor = {
            size: this.size,
            usage: this.usage,
        };

        this.deviceMemory = this.device.createBuffer(descriptor);
    }

    add_fine_partition(parent_index: number, size: number, payload: number[]): number {

        const fine_partitions = this.fine_partitions[parent_index];
        const partition_index = fine_partitions.length;

        let offset = 0;
        if (partition_index > 0) {
            const last_region = fine_partitions[partition_index - 1];
            offset = last_region.offset + last_region.size;
        }
        fine_partitions.push(new Partition(offset, size, payload));

        return partition_index;
    }

    blit_to_coarse_partition(coarse_index: number, src: Float32Array, offset: number) {

        const host_memory = this.hostMemories[coarse_index];

        host_memory.set(src, offset);
    }

    upload_coarse_partition(coarse_index: number) {
        
        const coarse_partition = this.coarse_partitions[coarse_index];
        const buffer_offset = coarse_partition.offset;
        const host_memory = this.hostMemories[coarse_index];
        const host_size = host_memory.byteLength;

        const MAX_CHUNK_BYTES = 15 * 1024 * 1024; // 15 MiB

        let remaining = host_size;
        let localBufferOffset = buffer_offset;
        let localSrcOffset = 0; // byte offset inside host_memory

        while (remaining > 0) {
            const chunk = Math.min(remaining, MAX_CHUNK_BYTES);
            const chunkView = new Float32Array(
                host_memory.buffer,
                host_memory.byteOffset + localSrcOffset,
                chunk / 4 // Convert bytes to float32 elements
            );
            
            this.device.queue.writeBuffer(
                this.deviceMemory,
                localBufferOffset,
                chunkView
            );
            
            remaining -= chunk;
            localSrcOffset += chunk;
            localBufferOffset += chunk;
        }
    }

    get_fine_partition(coarse_index: number, fine_index: number): Partition {
        return this.fine_partitions[coarse_index][fine_index];
    }

    get_coarse_partition(coarse_index: number): Partition {
        return this.coarse_partitions[coarse_index];
    }

    blit_to_fine_partition(coarse_index: number, fine_index: number, src: Float32Array) {

        const host_memory = this.hostMemories[coarse_index];
        const partition = this.fine_partitions[coarse_index][fine_index];
        const offset = partition.offset;

        host_memory.set(src, offset);
    }

    upload_fine_partition(coarse_index: number, fine_index: number) {
        const coarse_partition = this.coarse_partitions[coarse_index];
        const fine_partition = this.fine_partitions[coarse_index][fine_index];
        const buffer_offset = coarse_partition.offset + 4 * fine_partition.offset;
        const host_memory = this.hostMemories[coarse_index];
        const src_offset = fine_partition.offset * 4;
        const src_size = fine_partition.size * 4;

        const MAX_CHUNK_BYTES = 15 * 1024 * 1024;

        let remaining = src_size;
        let localBufferOffset = buffer_offset;
        let localSrcByteOffset = src_offset;

        while (remaining > 0) {
            const chunk = Math.min(remaining, MAX_CHUNK_BYTES);
            const chunkView = new Float32Array(
                host_memory.buffer,
                host_memory.byteOffset + localSrcByteOffset,
                chunk / 4
            );
            
            this.device.queue.writeBuffer(
                this.deviceMemory,
                localBufferOffset,
                chunkView
            );
            
            remaining -= chunk;
            localSrcByteOffset += chunk;
            localBufferOffset += chunk;
        }
    }
    
}