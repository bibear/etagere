// Types of scripts/release-docker.js (imported by the server tests).
export declare const IMAGE: string;
export declare const PLATFORMS: string[];
export declare function releaseCommands(options: {
  version: string;
  latest?: boolean;
  image?: string;
  platforms?: string[];
}): Array<[string, string[]]>;
