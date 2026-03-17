import { Camera } from './Camera';
export declare class NullGraph {
    private device;
    private context;
    private pipeline;
    private entityStorageBuffer;
    private cameraUniformBuffer;
    private bindGroup;
    private readonly STRIDE_FLOATS;
    private currentEntityCount;
    init(canvas: HTMLCanvasElement): Promise<void>;
    updateCamera(camera: Camera): void;
    updateEntities(rawECSBuffer: Float32Array, entityCount: number): void;
    render(): void;
}
