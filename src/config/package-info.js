import { readFileSync } from 'node:fs';

/**
 * This package's own package.json, read beside the source rather than from the working directory.
 *
 * The servers announced a hardcoded '1.0.0' from the initial commit on, whatever was released, and the
 * server-info tool read './package.json', which under npx is the user's project, not this package.
 * Reading it here makes the release bump in package.json the only one there is.
 */
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export const PACKAGE_NAME = pkg.name;
export const PACKAGE_VERSION = pkg.version;
export const PACKAGE_DESCRIPTION = pkg.description;
