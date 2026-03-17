import { Camera } from './Camera';

export class NullGraph {
    private device!: GPUDevice;
    private context!: GPUCanvasContext;
    private pipeline!: GPURenderPipeline;
    private entityStorageBuffer!: GPUBuffer;
    private cameraUniformBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;

    // 56 bytes per entity = 14 floats
    private readonly STRIDE_FLOATS = 14;
    private currentEntityCount = 0;

    public async init(canvas: HTMLCanvasElement) {
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU not supported!");
        this.device = await adapter.requestDevice();
        this.context = canvas.getContext('webgpu') as GPUCanvasContext;

        const format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({ device: this.device, format });

        // 1. Create Shader (Notice the Camera Uniform is added)
        const shaderModule = this.device.createShaderModule({
            code: `
                struct CameraUniform {
                    viewProj: mat4x4<f32>,
                };
                @group(0) @binding(0) var<uniform> camera: CameraUniform;
                @group(0) @binding(1) var<storage, read> ecsData: array<f32>;

                struct VertexOutput {
                    @builtin(position) position: vec4<f32>,
                    @location(0) color: vec3<f32>,
                };

                // Simple Triangle
                var<private> triVerts: array<vec3<f32>, 3> = array<vec3<f32>, 3>(
                    vec3<f32>(-0.5, -0.5, 0.0),
                    vec3<f32>( 0.5, -0.5, 0.0),
                    vec3<f32>( 0.0,  0.5, 0.0)
                );

                @vertex
                fn vs_main(@builtin(vertex_index) vIdx: u32, @builtin(instance_index) iIdx: u32) -> VertexOutput {
                    var out: VertexOutput;
                    let baseIndex = iIdx * 14u; // Stride

                    let posX = ecsData[baseIndex + 1u];
                    let posY = ecsData[baseIndex + 2u];
                    let posZ = ecsData[baseIndex + 3u];
                    
                    let scaleX = ecsData[baseIndex + 8u];
                    let scaleY = ecsData[baseIndex + 9u];
                    let scaleZ = ecsData[baseIndex + 10u];

                    let r = ecsData[baseIndex + 11u];
                    let g = ecsData[baseIndex + 12u];
                    let b = ecsData[baseIndex + 13u];

                    let vert = triVerts[vIdx];
                    let worldPos = vec3<f32>(
                        (vert.x * scaleX) + posX,
                        (vert.y * scaleY) + posY,
                        (vert.z * scaleZ) + posZ
                    );

                    // Apply Camera ViewProjection
                    out.position = camera.viewProj * vec4<f32>(worldPos, 1.0);
                    out.color = vec3<f32>(r, g, b);
                    return out;
                }

                @fragment
                fn fs_main(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
                    return vec4<f32>(color, 1.0);
                }
            `
        });

        // 2. Create Render Pipeline
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: shaderModule, entryPoint: 'vs_main' },
            fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
            primitive: { topology: 'triangle-list' }
        });

        // 3. Create GPU Buffers
        const maxEntities = 50000;
        this.entityStorageBuffer = this.device.createBuffer({
            size: maxEntities * this.STRIDE_FLOATS * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.cameraUniformBuffer = this.device.createBuffer({
            size: 16 * 4, // 16 floats for mat4
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // 4. Create Bind Group
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
                { binding: 1, resource: { buffer: this.entityStorageBuffer } }
            ]
        });
    }

    public updateCamera(camera: Camera) {
        this.device.queue.writeBuffer(
            this.cameraUniformBuffer,
            0,
            camera.bufferData.buffer, // <-- .buffer extracts the raw ArrayBuffer
            camera.bufferData.byteOffset,
            16 * 4 // Size in bytes
        );
    }

    public updateEntities(rawECSBuffer: Float32Array, entityCount: number) {
        this.currentEntityCount = entityCount;
        this.device.queue.writeBuffer(
            this.entityStorageBuffer,
            0,
            rawECSBuffer.buffer, // <-- .buffer extracts the raw ArrayBuffer
            rawECSBuffer.byteOffset,
            entityCount * this.STRIDE_FLOATS * 4 // Size in bytes
        );
    }

    public render() {
        if (this.currentEntityCount === 0) return;

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.05, g: 0.05, b: 0.05, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }]
        });

        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.draw(3, this.currentEntityCount, 0, 0);
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }
}