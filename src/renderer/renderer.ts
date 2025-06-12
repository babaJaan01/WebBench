import { Scene } from "../scene";
import { CubeMapMaterial } from "./cube_material";
import { Pipeline } from "./pipelines";
import { Buffer } from "./buffer";
import { ObjMesh } from "../mesh/obj_mesh";
import { vec3 } from "gl-matrix";
import { Node } from "../acceleration_structures/node";
import { BVH } from "../acceleration_structures/bvh";
import { BlasDescription } from "../acceleration_structures/blas_description";
import { COARSE_PARTITION_TYPE, filenames, FINE_PARTITION_TYPE, object_type_count, scales } from "../constants";
import { Random } from "random";

export class Renderer {

    canvas: HTMLCanvasElement;

    // Device/Context objects
    adapter: GPUAdapter;
    device: GPUDevice;
    context: GPUCanvasContext;
    format : GPUTextureFormat;

    //Assets
    color_buffer: GPUTexture;
    color_buffer_view: GPUTextureView;
    sampler: GPUSampler;
    sceneParameters: Buffer;
    triangleBuffer: Buffer;
    nodeBuffer: Buffer;
    blasDescriptionBuffer: Buffer;
    triangleIndexBuffer: Buffer;
    blasIndexBuffer: Buffer;
    sky_texture: CubeMapMaterial;

    // Pipeline objects
    ray_tracing_pipeline: Pipeline<GPUComputePipeline>
    ray_tracing_bind_group: GPUBindGroup
    screen_pipeline: Pipeline<GPURenderPipeline>
    screen_bind_group: GPUBindGroup

    // Meshes
    meshes: Map<FINE_PARTITION_TYPE, ObjMesh>;
    coarse_indices: Map<COARSE_PARTITION_TYPE, number>;
    fine_indices: Map<FINE_PARTITION_TYPE, number>[];

    // Scene to render
    scene: Scene
    frametime: number
    loaded: boolean = false;

    // BVH
    bvh_buffer: Buffer;
    tlas: BVH;

    private isContinuousRenderingActive: boolean = false;

    constructor(canvas: HTMLCanvasElement, scene: Scene){
        this.canvas = canvas;
        this.scene = scene;

        this.meshes = new Map();
        this.coarse_indices = new Map();
        this.fine_indices = [new Map(), new Map()];
    }

    async initialize() {
        console.log('Renderer initialization started');
        try {
            await this.setupDevice();
            console.log('Device setup complete');

            this.ray_tracing_pipeline = new Pipeline<GPUComputePipeline>(this.device, GPUShaderStage.COMPUTE);
            this.screen_pipeline = new Pipeline<GPURenderPipeline>(this.device, GPUShaderStage.FRAGMENT);
            console.log('Pipelines created');

            await this.makeBindGroupLayouts();
            console.log('Bind group layouts created');

            await this.createAssets();
            console.log('Assets created');

            await this.makeBindGroups();
            console.log('Bind groups created');
        
            await this.makePipelines();
            console.log('Pipelines built');

            this.frametime = 16;
            console.log('Renderer initialization complete');
        } catch (error) {
            console.error('Error during renderer initialization:', error);
            throw error;
        }
    }

    async setupDevice() {
        console.log('Setting up WebGPU device');
        
        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported in this browser");
        }
        
        try {
            console.log('Requesting GPU adapter');
            const adapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });
            
            if (!adapter) {
                throw new Error("Failed to get GPU adapter");
            }
            
            this.adapter = adapter;
            
            console.log('Adapter received, requesting device');
            this.device = await this.adapter.requestDevice();
            
            console.log('Device created, configuring canvas context');
            const context = this.canvas.getContext("webgpu");
            
            if (!context) {
                throw new Error("Failed to get WebGPU context from canvas");
            }
            
            this.context = context;
            
            this.format = navigator.gpu.getPreferredCanvasFormat();
            console.log('Using preferred format:', this.format);
            
            // Make sure canvas dimensions are set correctly
            console.log('Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);
            
            this.context.configure({
                device: this.device,
                format: this.format,
                alphaMode: "opaque"
            });
            
            console.log('WebGPU setup complete');
        } catch (error) {
            console.error('Error during WebGPU setup:', error);
            throw error;
        }
    }

    async makeBindGroupLayouts() {

        this.ray_tracing_pipeline.addImage2D();
        this.ray_tracing_pipeline.addBuffer('uniform');
        this.ray_tracing_pipeline.addBuffer('read-only-storage');
        this.ray_tracing_pipeline.addBuffer('read-only-storage');
        this.ray_tracing_pipeline.addBuffer('read-only-storage');
        this.ray_tracing_pipeline.addBuffer('read-only-storage');
        this.ray_tracing_pipeline.addImageCube();
        await this.ray_tracing_pipeline.makeBindGroupLayout();

        this.screen_pipeline.addImage2D();
        await this.screen_pipeline.makeBindGroupLayout();

    }

    async createAssets() {
        
        this.color_buffer = this.device.createTexture(
            {
                size: {
                    width: this.canvas.width,
                    height: this.canvas.height,
                },
                format: "rgba8unorm",
                usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
            }
        );
        this.color_buffer_view = this.color_buffer.createView();

        const samplerDescriptor: GPUSamplerDescriptor = {
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1
        };
        this.sampler = this.device.createSampler(samplerDescriptor);

        this.sceneParameters = new Buffer(this.device)
        this.sceneParameters.add_coarse_partition(16 * 4, GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM);
        this.sceneParameters.Initialize();

        await this.load_models();

        this.build_tlas();

        this.allocate_coarse_partitions();

        this.allocate_fine_partitions();

        this.upload_meshes();

        this.blasDescriptionBuffer = new Buffer(this.device)
        this.blasDescriptionBuffer.add_coarse_partition(
            4 * 20 * this.scene.objects.length,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
        this.blasDescriptionBuffer.Initialize();

        await this.createSolidColorSkybox();
    }

    async createSolidColorSkybox() {
        try {
            const size = 1;
            const skyTexture = this.device.createTexture({
                size: [size, size, 6],
                dimension: '2d',
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });
            
            const colors = [
                [0.3, 0.5, 0.8, 1.0], // Right (+X) - Blue
                [0.3, 0.5, 0.8, 1.0], // Left (-X) - Blue
                [0.3, 0.7, 0.9, 1.0], // Top (+Y) - Light blue
                [0.5, 0.5, 0.5, 1.0], // Bottom (-Y) - Gray
                [0.3, 0.5, 0.8, 1.0], // Front (+Z) - Blue
                [0.3, 0.5, 0.8, 1.0], // Back (-Z) - Blue
            ];
            
            for (let i = 0; i < 6; i++) {
                const color = colors[i];
                const data = new Uint8Array([
                    Math.floor(color[0] * 255),
                    Math.floor(color[1] * 255),
                    Math.floor(color[2] * 255),
                    Math.floor(color[3] * 255)
                ]);
                
                this.device.queue.writeTexture(
                    { texture: skyTexture, origin: [0, 0, i] },
                    data,
                    { bytesPerRow: 4, rowsPerImage: 1 },
                    [size, size, 1]
                );
            }
            
            this.sky_texture = new CubeMapMaterial();
            this.sky_texture.view = skyTexture.createView({
                dimension: 'cube',
                aspect: 'all',
                baseArrayLayer: 0,
                arrayLayerCount: 6,
            });
            
            this.sky_texture.sampler = this.device.createSampler({
                addressModeU: 'repeat',
                addressModeV: 'repeat',
                addressModeW: 'repeat',
                magFilter: 'linear',
                minFilter: 'linear',
                mipmapFilter: 'linear',
                maxAnisotropy: 1,
            });
            
            console.log("Created solid color skybox");
        } catch (error) {
            console.error("Error creating skybox:", error);
        }
    }

    async load_models() {

        const random = new Random();
        for (let i = 1; i < object_type_count + 1; i++) {
            try {
                const object_type: FINE_PARTITION_TYPE = FINE_PARTITION_TYPE.TLAS + i;
                const mesh = new ObjMesh();
                this.meshes.set(object_type, mesh);
                const r = random.float(0.0, 1.0);
                const g = random.float(0.0, 1.0);
                const b = random.float(0.0, 1.0);
                const color: vec3 = [r, g, b];
                const filename: string = filenames.get(object_type)!;
                const scale: number = scales.get(object_type)!;
                
                console.log(`Attempting to load model: ${filename}`);
                
                try {
                    // Pre-check if the file exists
                    const checkResponse = await fetch(filename);
                    if (!checkResponse.ok) {
                        throw new Error(`File not found: ${filename} (${checkResponse.status})`);
                    }
                } catch (fetchErr) {
                    console.error(`Fetch error for ${filename}:`, fetchErr);
                    // Create a dummy mesh to avoid crashes
                    this.meshes.set(object_type, new ObjMesh());
                    continue;
                }
                
                await mesh.initialize(color, filename, scale);
                console.log(`Successfully loaded model: ${filename}`);
            } catch (error) {
                console.error(`Failed to load model ${i}:`, error);
            }
        }
    }

    build_tlas() {
        if (this.scene.objects.length === 0) {
            this.tlas = new BVH([]);
            return;
        }

        const input_nodes = new Array<Node>(this.scene.objects.length);
        let validNodeCount = 0;
        
        for (let i = 0; i < this.scene.objects.length; ++i) {
            const mesh = this.meshes.get(this.scene.objects[i].object_type);
            if (mesh) {
                const node = mesh.get_node();
                input_nodes[validNodeCount] = new BlasDescription(node, this.scene.objects[i].model, 0).get_node();
                validNodeCount++;
            }
        }
        
        if (validNodeCount === 0) {
            this.tlas = new BVH([]);
            return;
        }
        
        const finalNodes = validNodeCount < this.scene.objects.length 
            ? input_nodes.slice(0, validNodeCount) 
            : input_nodes;
            
        this.tlas = new BVH(finalNodes);
    }

    allocate_coarse_partitions() {
        let node_count = 2 * this.scene.objects.length - 1;
        let index_count = this.scene.objects.length;

        for (let i = 1; i < object_type_count + 1; i++) {
            const object_type: FINE_PARTITION_TYPE = FINE_PARTITION_TYPE.TLAS + i;
            const mesh = this.meshes.get(object_type)!;
            node_count += mesh.bvh.nodes.length;
            index_count += mesh.bvh.indices.length;
        }

        const node_size = 32 * node_count;
        const index_size = 4 * index_count;
        const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

        this.bvh_buffer = new Buffer(this.device)
        this.coarse_indices.set(
            COARSE_PARTITION_TYPE.NODES, 
            this.bvh_buffer.add_coarse_partition(node_size, usage));
        this.coarse_indices.set(
                COARSE_PARTITION_TYPE.LOOKUP, 
                this.bvh_buffer.add_coarse_partition(index_size, usage));
        this.bvh_buffer.Initialize();
    }

    allocate_fine_partitions() {

        // TLAS
        let coarse_index = this.coarse_indices.get(COARSE_PARTITION_TYPE.NODES)!;
        let element_count = 8 * (2 * this.scene.objects.length - 1);
        let payload = [0, 0];
        this.fine_indices[coarse_index].set(FINE_PARTITION_TYPE.TLAS, 
            this.bvh_buffer.add_fine_partition(coarse_index, element_count, payload));
        
        coarse_index = this.coarse_indices.get(COARSE_PARTITION_TYPE.LOOKUP)!;
        element_count = this.scene.objects.length;
        payload = [0,];
        this.fine_indices[coarse_index].set(
            FINE_PARTITION_TYPE.TLAS, 
            this.bvh_buffer.add_fine_partition(coarse_index, element_count, payload));

        // Meshes
        let node_offset = 2 * this.scene.objects.length - 1;
        let index_offset = this.scene.objects.length;
        let tri_offset = 0;
        for (let i = 1; i < object_type_count + 1; i++) {
            const object_type: FINE_PARTITION_TYPE = FINE_PARTITION_TYPE.TLAS + i;
            const mesh = this.meshes.get(object_type)!;

            // Nodes
            coarse_index = this.coarse_indices.get(COARSE_PARTITION_TYPE.NODES)!;
            element_count = 8 * mesh.bvh.nodes.length;
            payload = [node_offset, index_offset];
            let fine_index = this.bvh_buffer.add_fine_partition(coarse_index, element_count, payload);
            this.fine_indices[coarse_index].set(object_type, fine_index);
            node_offset += mesh.bvh.nodes.length;
            const node_data = mesh.bvh.get_flattened_nodes(payload);
            this.bvh_buffer.blit_to_fine_partition(coarse_index, fine_index, node_data);
            this.bvh_buffer.upload_fine_partition(coarse_index, fine_index);

            // Indices
            coarse_index = this.coarse_indices.get(COARSE_PARTITION_TYPE.LOOKUP)!;
            element_count = mesh.bvh.indices.length;
            payload = [tri_offset,];
            fine_index = this.bvh_buffer.add_fine_partition(coarse_index, element_count, payload);
            this.fine_indices[coarse_index].set(object_type, fine_index);
            index_offset += mesh.bvh.indices.length;
            tri_offset += mesh.bvh.indices.length;
            const index_data = mesh.bvh.get_flattened_indices(payload);
            this.bvh_buffer.blit_to_fine_partition(coarse_index, fine_index, index_data);
            this.bvh_buffer.upload_fine_partition(coarse_index, fine_index);
        }
    }

    upload_meshes() {
        this.triangleBuffer = new Buffer(this.device);
        
        let triangle_count = 0;
        for (let i = 1; i < object_type_count + 1; i++) {
            const object_type: FINE_PARTITION_TYPE = FINE_PARTITION_TYPE.TLAS + i;
            const mesh = this.meshes.get(object_type);
            if (mesh && mesh.triangles && mesh.triangles.length > 0) {
                triangle_count += mesh.triangles.length;
            }
        }

        const size = 4 * 28 * Math.max(1, triangle_count);
        const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        const triangleBufferIndex = this.triangleBuffer.add_coarse_partition(size, usage);
        this.triangleBuffer.Initialize();

        if (triangle_count === 0) {
            console.warn("No valid triangles found to upload");
            const emptyData = new Float32Array(28); // One empty triangle
            this.triangleBuffer.blit_to_coarse_partition(triangleBufferIndex, emptyData, 0);
            this.triangleBuffer.upload_coarse_partition(triangleBufferIndex);
            return;
        }

        let blit_offset = 0;
        let successCount = 0;

        for (let i = 1; i < object_type_count + 1; i++) {
            const object_type: FINE_PARTITION_TYPE = FINE_PARTITION_TYPE.TLAS + i;
            const mesh = this.meshes.get(object_type);
            
            if (!mesh || !mesh.triangles || mesh.triangles.length === 0) continue;
            
            for (let j = 0; j < mesh.triangles.length; j++) {
                try {
                    const triangle = mesh.triangles[j];
                    if (!triangle) continue;
                    
                    if (!triangle.corners || triangle.corners.length < 3 || 
                        !triangle.normals || triangle.normals.length < 3) {
                        continue;
                    }
                    
                    triangle.flatten();
                    
                    if (triangle.data) {
                        this.triangleBuffer.blit_to_coarse_partition(
                            triangleBufferIndex, triangle.data, blit_offset);
                        blit_offset += 28;
                        successCount++;
                    }
                } catch (error) {
                    if (j === 0) {
                        console.error(`Error processing triangles for model type ${i}:`, error);
                    }
                }
            }
        }

        console.log(`Successfully uploaded ${successCount} triangles out of ${triangle_count} total`);
        this.triangleBuffer.upload_coarse_partition(triangleBufferIndex);
    }

    async makeBindGroups() {

        this.ray_tracing_bind_group = this.device.createBindGroup({
            layout: this.ray_tracing_pipeline.bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: this.color_buffer_view
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.sceneParameters.deviceMemory,
                    }
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.triangleBuffer.deviceMemory,
                    }
                },
                {
                    binding: 3,
                    resource: {
                        label: "BVH Node buffer",
                        buffer: this.bvh_buffer.deviceMemory,
                        offset: this.bvh_buffer.get_coarse_partition(0).offset,
                    }
                },
                {
                    binding: 4,
                    resource: {
                        buffer: this.blasDescriptionBuffer.deviceMemory,
                    }
                },
                {
                    binding: 5,
                    resource: {
                        label: "BVH Index buffer",
                        buffer: this.bvh_buffer.deviceMemory,
                        offset: this.bvh_buffer.get_coarse_partition(1).offset,
                    }
                },
                {
                    binding: 6,
                    resource: this.sky_texture.view,
                },
                {
                    binding: 7,
                    resource: this.sky_texture.sampler,
                },
            ]
        });

        this.screen_bind_group = this.device.createBindGroup({
            layout: this.screen_pipeline.bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: this.sampler
                },
                {
                    binding: 1,
                    resource: this.color_buffer_view
                }
            ]
        });

    }

    async makePipelines() {
        try {
            const raytracerKernelResponse = await fetch('/shaders/raytracer_kernel.wgsl');
            if (!raytracerKernelResponse.ok) {
                throw new Error(`Failed to fetch raytracer_kernel.wgsl: ${raytracerKernelResponse.statusText}`);
            }
            const raytracer_kernel_code = await raytracerKernelResponse.text();

            const screenShaderResponse = await fetch('/shaders/screen_shader.wgsl');
            if (!screenShaderResponse.ok) {
                throw new Error(`Failed to fetch screen_shader.wgsl: ${screenShaderResponse.statusText}`);
            }
            const screen_shader_code = await screenShaderResponse.text();

            console.log("Building ray tracing pipeline...");
            await this.ray_tracing_pipeline.build(raytracer_kernel_code, ['main']);
            
            console.log("Building screen pipeline...");
            await this.screen_pipeline.build(screen_shader_code, ['vert_main', 'frag_main']);

        } catch (error) {
            console.error("Error in makePipelines:", error);
            throw error; 
        }
    }

    prepareScene() {

        let coarse_index = 0;
        this.sceneParameters.blit_to_coarse_partition(coarse_index, this.scene.camera.data, 0);
        this.sceneParameters.upload_coarse_partition(coarse_index);

        if (this.scene.objects.length === 0) {
            this.tlas = new BVH([]);
            
            coarse_index = 0;
            const fine_index = 0;
            let payload = this.bvh_buffer.get_fine_partition(coarse_index, fine_index).payload;
            const node_data = this.tlas.get_flattened_nodes(payload);
            this.bvh_buffer.blit_to_fine_partition(coarse_index, fine_index, node_data);
            this.bvh_buffer.upload_fine_partition(coarse_index, fine_index);
            
            coarse_index = 1;
            payload = this.bvh_buffer.get_fine_partition(coarse_index, fine_index).payload;
            const index_data = this.tlas.get_flattened_indices(payload);
            this.bvh_buffer.blit_to_fine_partition(coarse_index, fine_index, index_data);
            this.bvh_buffer.upload_fine_partition(coarse_index, fine_index);
            
            return;
        }

        let blit_offset = 0;
        const input_nodes = new Array<Node>(this.scene.objects.length);
        let validNodeCount = 0;
        
        for (let i = 0; i < this.scene.objects.length; i++) {
            const object = this.scene.objects[i];
            const mesh = this.meshes.get(object.object_type);
            
            if (!mesh) continue;
            
            const statue_node = mesh.get_node();
            const blas_root_node = this.bvh_buffer.get_fine_partition(0, object.object_type).offset / 8;
            const instance = new BlasDescription(
                statue_node, object.model, blas_root_node);
            this.blasDescriptionBuffer.blit_to_coarse_partition(coarse_index, instance.data, blit_offset);
            blit_offset += 20;
            input_nodes[validNodeCount] = instance.get_node();
            validNodeCount++;
        }
        
        this.blasDescriptionBuffer.upload_coarse_partition(coarse_index);

        if (validNodeCount === 0) {
            this.tlas = new BVH([]);
        } else { 
            const finalNodes = validNodeCount < this.scene.objects.length 
                ? input_nodes.slice(0, validNodeCount) 
                : input_nodes;
                
            this.tlas = new BVH(finalNodes);
        }

        const fine_index = 0;
        let payload = this.bvh_buffer.get_fine_partition(coarse_index, fine_index).payload;
        const node_data = this.tlas.get_flattened_nodes(payload);
        this.bvh_buffer.blit_to_fine_partition(coarse_index, fine_index, node_data);
        this.bvh_buffer.upload_fine_partition(coarse_index, fine_index);
        
        coarse_index = 1;
        payload = this.bvh_buffer.get_fine_partition(coarse_index, fine_index).payload;
        const index_data = this.tlas.get_flattened_indices(payload);
        this.bvh_buffer.blit_to_fine_partition(coarse_index, fine_index, index_data);
        this.bvh_buffer.upload_fine_partition(coarse_index, fine_index);

        if (!this.loaded) {
            this.loaded = true;
            //console.log(node_data);
            //console.log(index_data);
            //console.log(this.blasDescriptionBuffer.hostMemory);
        }
    }

    // Single frame rendering method
    renderSingleFrame(lightweightMode: boolean = false) {
        console.log('Rendering single frame', lightweightMode ? '(lightweight mode)' : '');
        try {
            const start: number = performance.now();

            this.scene.update(this.frametime);
            this.prepareScene();

            const commandEncoder: GPUCommandEncoder = this.device.createCommandEncoder();

            const RENDER_PASSES = lightweightMode ? 1 : 3;
            
            for (let pass = 0; pass < RENDER_PASSES; pass++) {
                const ray_trace_pass: GPUComputePassEncoder = commandEncoder.beginComputePass();
                ray_trace_pass.setPipeline(this.ray_tracing_pipeline.pipeline);
                ray_trace_pass.setBindGroup(0, this.ray_tracing_bind_group);
                
                const divisor = lightweightMode ? 8 : 4;
                const workgroupSizeX = Math.max(1, Math.ceil(this.canvas.width / divisor)); 
                const workgroupSizeY = Math.max(1, Math.ceil(this.canvas.height / divisor));
                
                ray_trace_pass.dispatchWorkgroups(workgroupSizeX, workgroupSizeY, 1);
                ray_trace_pass.end();
            }

            const textureView: GPUTextureView = this.context.getCurrentTexture().createView();
            const renderpass: GPURenderPassEncoder = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: textureView,
                    clearValue: {r: 0.0, g: 0.0, b: 0.0, a: 1.0}, // Set to black
                    loadOp: "clear",
                    storeOp: "store"
                }]
            });

            renderpass.setPipeline(this.screen_pipeline.pipeline);
            renderpass.setBindGroup(0, this.screen_bind_group);
            renderpass.draw(6, 1, 0, 0);
            
            renderpass.end();
        
            this.device.queue.submit([commandEncoder.finish()]);
            console.log('Frame commands submitted to GPU');

            const end: number = performance.now();
            this.frametime = end - start;

            return this.frametime;
        } catch (error) {
            console.error('Error rendering frame:', error);
            return 0;
        }
    }

    startContinuousRendering() {
        if (!this.isContinuousRenderingActive) {
            this.isContinuousRenderingActive = true;
            this.render();
        }
    }

    stopContinuousRendering() {
        this.isContinuousRenderingActive = false;
    }

    render = () => {
        if (!this.isContinuousRenderingActive) {
            return;
        }

        this.renderSingleFrame();

        const performanceLabel: HTMLElement = <HTMLElement> document.getElementById("render-time");
        if (performanceLabel) {
            performanceLabel.innerText = this.frametime.toString();
        }

        requestAnimationFrame(this.render);
    }
}