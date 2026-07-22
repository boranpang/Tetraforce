import packageMetadata from "../package.json" with { type: "json" };

export const COLLECTOR_VERSION = packageMetadata.version;
