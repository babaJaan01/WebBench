export class Pipeline<T> {

    device: GPUDevice;

    pipeline: T
    bind_group_layout: GPUBindGroupLayout
    entries: Array<GPUBindGroupLayoutEntry>;
    
    visibility: number
    binding: number

    constructor(device: GPUDevice, visibility: number){
        this.device = device;
        this.visibility = visibility;
        this.entries = new Array<GPUBindGroupLayoutEntry>();
        this.binding = 0;
    }

    addImage2D() {

        if (this.visibility == GPUShaderStage.COMPUTE){
            this.entries.push({
                binding: this.binding,
                visibility: this.visibility,
                storageTexture: {
                    access: "write-only",
                    format: "rgba8unorm",
                    viewDimension: "2d"
                }
            })
            this.binding += 1;
        }
        else {
            this.entries.push({
                binding: this.binding,
                visibility: this.visibility,
                sampler: {}
            });
            this.binding += 1;
            this.entries.push({
                binding: this.binding,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            });
            this.binding += 1;
        }
    }

    addBuffer(type: string) {

        this.entries.push({
            binding: this.binding,
            visibility: this.visibility,
            buffer: {
                type: type as GPUBufferBindingType,
                hasDynamicOffset: false,
            }
        })
        this.binding += 1;
    }

    addImageCube() {
        this.entries.push({
            binding: this.binding,
            visibility: this.visibility,
            texture: {
                viewDimension: "cube",
            }
        })
        this.binding += 1;

        this.entries.push({
            binding: this.binding,
            visibility: this.visibility,
            sampler: {}
        })
        this.binding += 1;
    }

    async makeBindGroupLayout() {

        this.bind_group_layout = this.device.createBindGroupLayout({entries: this.entries});

    }

    async build(src_code: string, entry_points: string[]) {
        
        try {
            console.log(`Creating shader module with entry points: ${entry_points.join(', ')}`);
            
            const shader_module = this.device.createShaderModule({
                code: src_code,
                label: entry_points.join('_')
            });
            
            const compilationInfo = await shader_module.getCompilationInfo();
            if (compilationInfo.messages.length > 0) {
                console.warn("Shader compilation issues:");
                for (const message of compilationInfo.messages) {
                    console.warn(`${message.type} at ${message.lineNum}:${message.linePos} - ${message.message}`);
                }
            }
            
            const layout = this.device.createPipelineLayout({
                bindGroupLayouts: [this.bind_group_layout],
                label: "Pipeline Layout"
            });

            if (this.visibility == GPUShaderStage.COMPUTE) {
                try {
                    this.pipeline = 
                        this.device.createComputePipeline(
                            {
                                layout: layout,
                                label: "Compute Pipeline",
                                compute: {
                                    module: shader_module,
                                    entryPoint: entry_points[0],
                                },
                            }
                        ) as T;
                    console.log(`Successfully created compute pipeline with entry point: ${entry_points[0]}`);
                } catch (error) {
                    console.error(`Error creating compute pipeline: ${error}`);
                    throw error;
                }
            }
            else {
                try {
                    this.pipeline = this.device.createRenderPipeline({
                        layout: layout,
                        label: "Render Pipeline",
                        vertex: {
                            module: shader_module,
                            entryPoint: entry_points[0],
                        },
                        fragment: {
                            module: shader_module,
                            entryPoint: entry_points[1],
                            targets: [
                                {
                                    format: "bgra8unorm"
                                }
                            ]
                        },
                        primitive: {
                            topology: "triangle-list"
                        }
                    }) as T;
                    console.log(`Successfully created render pipeline with entry points: ${entry_points.join(', ')}`);
                } catch (error) {
                    console.error(`Error creating render pipeline: ${error}`);
                    throw error;
                }
            }
        } catch (error) {
            console.error(`Error building pipeline: ${error}`);
            throw error;
        }
    }
}