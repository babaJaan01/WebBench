import { vec3, vec2 } from "gl-matrix";
import { Triangle } from "./triangle";
import { Node } from "../acceleration_structures/node";
import { BVH } from "../acceleration_structures/bvh";

export class ObjMesh {

    v: vec3[]
    vt: vec2[]
    vn: vec3[]

    triangles: Triangle[]
    color: vec3
    scale: number

    minCorner: vec3
    maxCorner: vec3

    bvh: BVH;

    constructor() {
        this.v = [];
        this.vt = [];
        this.vn = [];
        this.triangles = [];
        this.color = [1, 1, 1]; // Default white
        this.scale = 1.0; // Default scale
        this.minCorner = [ 1.0e30,  1.0e30,  1.0e30];
        this.maxCorner = [-1.0e30, -1.0e30, -1.0e30];
    }

    async initialize(color: vec3, url: string, scale: number) {
        console.log(`Initializing OBJ model: ${url} with scale ${scale}`);

        this.color = color;
        this.scale = scale;
        
        try {
            await this.readFile(url);
            console.log(`Successfully loaded model: ${url} with ${this.triangles.length} triangles`);
        } catch (error) {
            console.error(`Failed to load model ${url}:`, error);
            // Create an empty mesh with a single placeholder triangle
            this.createPlaceholderTriangle();
        }
        
        // Clear vertex data to save memory
        this.v = [];
        this.vt = [];
        this.vn = [];
        
        this.build_bvh();
    }

    // Create a simple placeholder triangle when model loading fails
    createPlaceholderTriangle() {
        console.log("Creating placeholder triangle");
        const tri = new Triangle();
        
        // Create a simple pyramid/tetrahedron shape
        tri.corners = [
            [0, 0, 0],       // Base point 1
            [this.scale, 0, 0], // Base point 2
            [0, this.scale, 0]  // Top point
        ];
        
        // Simple upward normal
        const normal: vec3 = [0, 0, 1];
        tri.normals = [normal, normal, normal];
        tri.color = this.color;
        tri.make_centroid();
        
        this.triangles = [tri];
        
        // Update bounding box
        this.minCorner = [0, 0, 0];
        this.maxCorner = [this.scale, this.scale, 0];
    }

    async readFile(url: string) {
        const response: Response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
        }
        
        const blob: Blob = await response.blob();
        const file_contents = (await blob.text());
        const lines = file_contents.split("\n");
        
        console.log(`Parsing OBJ file with ${lines.length} lines`);
        
        // Ensure we have texture coordinates and normals as fallbacks
        if (this.vt.length === 0) {
            this.vt.push([0, 0]);
        }
        
        if (this.vn.length === 0) {
            this.vn.push([0, 1, 0]); // Default up normal
        }

        lines.forEach((line, index) => {
            try {
                if (line.length === 0) return;
                
                if (line[0] === "v" && line[1] === " ") {
                    this.read_vertex_data(line);
                }
                else if (line[0] === "v" && line[1] === "t") {
                    this.read_texcoord_data(line);
                }
                else if (line[0] === "v" && line[1] === "n") {
                    this.read_normal_data(line);
                }
                else if (line[0] === "f") {
                    this.read_face_data(line);
                }
            } catch (error) {
                console.warn(`Error parsing line ${index}: "${line}"`, error);
            }
        });
        
        if (this.triangles.length === 0) {
            console.warn("No triangles were created from the OBJ file");
            throw new Error("Model loaded but no valid triangles found");
        }
    }

    read_vertex_data(line: string) {
        const components = line.split(" ").filter(c => c.trim().length > 0);
        if (components.length < 4) {
            console.warn(`Invalid vertex line: ${line}`);
            return;
        }
        
        // ["v", "x", "y", "z"]
        const new_vertex: vec3 = [
            this.scale * Number(components[1]).valueOf(),
            this.scale * Number(components[2]).valueOf(),
            this.scale * Number(components[3]).valueOf()
        ];

        this.v.push(new_vertex);

        vec3.min(this.minCorner, this.minCorner, new_vertex);
        vec3.max(this.maxCorner, this.maxCorner, new_vertex);
    }

    read_texcoord_data(line: string) {
        const components = line.split(" ").filter(c => c.trim().length > 0);
        if (components.length < 3) {
            console.warn(`Invalid texcoord line: ${line}`);
            return;
        }
        
        // ["vt", "u", "v"]
        const new_texcoord: vec2 = [
            Number(components[1]).valueOf(),
            Number(components[2]).valueOf()
        ];

        this.vt.push(new_texcoord);
    }

    read_normal_data(line: string) {
        const components = line.split(" ").filter(c => c.trim().length > 0);
        if (components.length < 4) {
            console.warn(`Invalid normal line: ${line}`);
            return;
        }
        
        // ["vn", "nx", "ny", "nz"]
        const new_normal: vec3 = [
            Number(components[1]).valueOf(),
            Number(components[2]).valueOf(),
            Number(components[3]).valueOf()
        ];

        this.vn.push(new_normal);
    }

    read_face_data(line: string) {
        line = line.replace("\n", "").trim();
        const vertex_descriptions = line.split(" ").filter(c => c.trim().length > 0);
        
        if (vertex_descriptions.length < 4) {
            console.warn(`Skipping face with too few vertices: ${line}`);
            return;
        }

        const indices: number[] = [];
        // Skip the "f" prefix
        for (let i = 1; i < vertex_descriptions.length; i++) {
            indices.push(i);
        }

        const triangle_indices = this.triangulate(indices);
        
        const triangle_count = triangle_indices.length / 3;
        for (let i = 0; i < triangle_count; i++) {
            try {
                const tri: Triangle = new Triangle();
                
                for (let j = 0; j < 3; j++) {
                    const triangle_index = triangle_indices[3 * i + j];
                    this.read_corner(vertex_descriptions[triangle_index], tri);
                }
                
                if (tri.corners.length === 3 && tri.normals.length === 3) {
                    tri.color = this.color;
                    tri.make_centroid();
                    this.triangles.push(tri);
                }
            } catch (error) {
                console.warn(`Error creating triangle from face: ${line}`, error);
            }
        }
    }

    triangulate(indices: number[]): number[] {
        const triangle_indices: number[] = [];

        for (let i = 0; i < indices.length - 2; i++) {
            triangle_indices.push(indices[0]);
            triangle_indices.push(indices[i + 1]);
            triangle_indices.push(indices[i + 2]);
        }

        return triangle_indices;
    }

    read_corner(vertex_description: string, tri: Triangle) {
        try {
            const v_vt_vn = vertex_description.split("/");
            
            // different OBJ face formats (v, v/vt, v//vn, v/vt/vn)
            const v_index = Math.max(0, Math.min(this.v.length - 1, parseInt(v_vt_vn[0]) - 1));
            const v = this.v[v_index];
            
            // Default to first normal if not specified
            let vn_index = 0;
            if (v_vt_vn.length > 2 && v_vt_vn[2].length > 0) {
                vn_index = Math.max(0, Math.min(this.vn.length - 1, parseInt(v_vt_vn[2]) - 1));
            }
            
            const vn = this.vn[vn_index];
            
            tri.corners.push(v);
            tri.normals.push(vn);
        } catch (error) {
            console.warn(`Error parsing vertex description: ${vertex_description}`, error);
            throw error;
        }
    }

    build_bvh() {
        if (this.triangles.length === 0) {
            this.bvh = new BVH([]);
            return;
        }
        
        const input_nodes = new Array<Node>(this.triangles.length);
        for (let i = 0; i < this.triangles.length; i++) {
            input_nodes[i] = this.triangles[i].get_node();
        }

        this.bvh = new BVH(input_nodes);
    }

    get_node(): Node {

        const node = new Node();

        vec3.min(node.minCorner, node.minCorner, this.minCorner);
        vec3.max(node.maxCorner, node.maxCorner, this.maxCorner);

        return node;
    }
}