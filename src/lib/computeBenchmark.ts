/*
 * WebGPU compute benchmark that uses a multi-worker pipelining strategy
 * to keep the GPU saturated, providing a stable and accurate GFLOP/s measurement.
 */

export interface ComputeResult {
  timeMs: number;
  gflops: number;
}

const LOOP_ITERATIONS = 65536; // Heavy workload per thread
const WORKGROUP_SIZE = 256;   // Threads per workgroup
const DEFAULT_ELEMENTS = 16 * 1024 * 1024; // 16M elements (64MB buffer)
const DEFAULT_DURATION_MS = 90_000;  // 90-second benchmark duration
const PIPELINE_DEPTH = 2; // Number of parallel workers to keep the GPU busy

export async function runComputeBenchmark(
  device: GPUDevice,
  elementCount = DEFAULT_ELEMENTS,
  targetMs = DEFAULT_DURATION_MS,
): Promise<ComputeResult> {
  // Buffer and Pipeline Setup
  const storageSize = elementCount * 4;
  const storage = device.createBuffer({
    size: storageSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const paramBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramBuf, 0, new Uint32Array([LOOP_ITERATIONS]));
  
  const fenceBuffers: GPUBuffer[] = [];
  for (let i = 0; i < PIPELINE_DEPTH; i++) {
    fenceBuffers.push(device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    }));
  }

  const code = await fetch('/shaders/compute_kernel.wgsl').then(r => r.text());
  const shaderModule = device.createShaderModule({ code });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shaderModule, entryPoint: 'main' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: storage } },
      { binding: 1, resource: { buffer: paramBuf } },
    ],
  });
  
  const maxWorkgroups = device.limits.maxComputeWorkgroupsPerDimension;
  const workgroupCount = Math.min(
    Math.ceil(elementCount / WORKGROUP_SIZE),
    maxWorkgroups
  );

  // -------------------------------------------------------------------------
  // Benchmark Execution with Pipelined Workers
  // -------------------------------------------------------------------------
  
  const encodeDispatch = (fenceBuffer: GPUBuffer): GPUCommandBuffer => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
    enc.copyBufferToBuffer(storage, 0, fenceBuffer, 0, 4);
    return enc.finish();
  };

  // Warm-up pass
  device.queue.submit([encodeDispatch(fenceBuffers[0])]);
  await fenceBuffers[0].mapAsync(GPUMapMode.READ);
  fenceBuffers[0].unmap();

  let dispatchCount = 0;
  let stop = false;
  const opsPerDispatch = elementCount * LOOP_ITERATIONS * 2;
  
  setTimeout(() => {
    stop = true;
  }, targetMs);

  const worker = async (fenceBuffer: GPUBuffer) => {
    while (!stop) {
      device.queue.submit([encodeDispatch(fenceBuffer)]);
      await fenceBuffer.mapAsync(GPUMapMode.READ);
      fenceBuffer.unmap();
      dispatchCount++;
    }
  };

  console.log(`Starting ${targetMs/1000}s benchmark. Saturating GPU.`);
  const startTime = performance.now();
  
  const workerPromises = fenceBuffers.map(buffer => worker(buffer));
  await Promise.all(workerPromises);

  const totalTimeMs = performance.now() - startTime;
  const totalOps = dispatchCount * opsPerDispatch;
  const gflops = totalOps / (totalTimeMs * 1e6);
  
  console.log(`Benchmark complete: ${Math.round(totalTimeMs/1000)}s total, ${gflops.toFixed(1)} GFLOP/s`);
  
  return { 
    timeMs: totalTimeMs,
    gflops,
  };
} 