/*
 * WebGPU ALU-heavy kernel used by Web-Bench compute benchmark.
 * Designed to match mprep's "Stress My GPU" benchmark approach:
 * - Iteration count passed via uniform
 * - Loop index used in calculation to prevent optimization
 * - Simple arithmetic operations that max out ALU
 */

struct Params {
    iterations: u32,
};

@group(0) @binding(0) var<storage, read_write> data : array<f32>;
@group(0) @binding(1) var<uniform> params : Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let idx : u32 = gid.x;
    if (idx >= arrayLength(&data)) {
        return;
    }

    var value : f32 = data[idx];
    let count : u32 = params.iterations;

    // Two floating-point operations per iteration
    // Using j in the calculation prevents compiler optimizations
    for (var j : u32 = 0u; j < count; j = j + 1u) {
        // Similar to mprep's approach: simple ALU-bound operations
        value = value * 1.000001 + f32(j % 16u) * 0.0000001;
    }

    data[idx] = value;
}