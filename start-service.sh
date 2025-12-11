#!/bin/sh
export HTTP_PROXY="http://176.169.105.96:3928"
export NO_PROXY="176.169.99.95,176.169.86.35"
bun run src/index.ts