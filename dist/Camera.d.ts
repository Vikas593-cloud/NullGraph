import { mat4, vec3 } from 'gl-matrix';
export declare class Camera {
    projectionMatrix: mat4;
    viewMatrix: mat4;
    viewProjectionMatrix: mat4;
    bufferData: Float32Array;
    constructor(fovDegrees: number, aspect: number, near: number, far: number);
    updateView(eye: vec3, target: vec3, up?: vec3): void;
}
