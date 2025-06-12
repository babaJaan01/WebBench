export enum COARSE_PARTITION_TYPE {
    NODES,
    LOOKUP,
};

export enum FINE_PARTITION_TYPE {
    TLAS = 0,
    PYRAMID,
}

const filenames: Map<FINE_PARTITION_TYPE, string> = new Map([
    [FINE_PARTITION_TYPE.PYRAMID, "/models/abstract_pyramid.obj"]
]);

const scales: Map<FINE_PARTITION_TYPE, number> = new Map([
    [FINE_PARTITION_TYPE.PYRAMID, 1.0],
]);

const object_type_count = 1;

export { filenames, scales, object_type_count };