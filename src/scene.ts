import { Camera } from "./camera";
import { vec3 } from "gl-matrix";
import { GameObject } from "./game_objects";
import { Random } from "random";
import { FINE_PARTITION_TYPE } from "./constants";

export class Scene {

    camera: Camera
    objects: GameObject[]
    debugMode: boolean = false
    cameraRotationSpeed: number
    cameraTheta: number

    constructor() {
        
        this.objects = [];
        
        const object_count = 20; // Increased from 5 to 20
        const random = new Random();
        
        const validObjectType = FINE_PARTITION_TYPE.PYRAMID;
        
        for (let i = 0; i < object_count; i++) {
            const radius = random.float(3.0, 15.0);
            const theta = random.float(0, Math.PI * 2);
            const phi = random.float(-Math.PI / 2, Math.PI / 2);
            
            const x = radius * Math.sin(theta) * Math.cos(phi);
            const y = radius * Math.sin(phi);
            const z = radius * Math.cos(theta) * Math.cos(phi);
            
            const position: vec3 = [x, y, z];

            const rx = random.float(0.0, 360.0);
            const ry = random.float(0.0, 360.0);
            const rz = random.float(0.0, 360.0);
            const eulers: vec3 = [rx, ry, rz];

            const ax = random.float(-0.2, 0.2);
            const ay = random.float(-0.2, 0.2);
            const az = random.float(-0.2, 0.2);
            const angular_velocity: vec3 = [ax, ay, az];
            
            this.objects.push(new GameObject(position, eulers, angular_velocity, validObjectType));
        }
        
        this.camera = new Camera([-10.0, 0.0, 0.0], 5);
        
        this.cameraRotationSpeed = 0.01;
        this.cameraTheta = 0;
    }

    update(frametime: number) {
        const cappedFrametime = Math.min(frametime, 50) / 16.667;
        
        this.objects.forEach(object => {
            object.update(cappedFrametime);
        });
        
        // Rotate the camera slowly around the scene center
        this.cameraTheta += this.cameraRotationSpeed * cappedFrametime;
        const radius = 10.0;
        const x = -radius * Math.cos(this.cameraTheta);
        const z = radius * Math.sin(this.cameraTheta);
        this.camera.position[0] = x;
        this.camera.position[2] = z;
        this.camera.updateMatrices();
    }
}