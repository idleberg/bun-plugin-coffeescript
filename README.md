# bun-plugin-coffeescript

> Use CoffeeScript with Bun, old meets new.

[![License](https://img.shields.io/github/license/idleberg/bun-plugin-coffeescript?color=blue&style=for-the-badge)](https://github.com/idleberg/bun-plugin-coffeescript/blob/main/LICENSE)
[![Version: npm](https://img.shields.io/npm/v/bun-plugin-coffeescript?style=for-the-badge)](https://www.npmjs.org/package/bun-plugin-coffeescript)
![GitHub branch check runs](https://img.shields.io/github/check-runs/idleberg/bun-plugin-coffeescript/main?style=for-the-badge)

## Description

This plugin provides support for both CoffeeScript and CSON to your Bun projects. It is roughly modelled after the [esbuild-coffeescript](https://www.npmjs.com/package/esbuild-coffeescript) and is still in its infancy. Your feedback or contribution is welcome!

## Installation

```shell
bun install bun-plugin-coffeescript
```

## Usage

```typescript
import CoffeePlugin from "bun-plugin-coffeescript";

Bun.build({
  entrypoints: ["app.coffee"],
  outdir: "dist",
  target: "browser",
  plugins: [
    CoffeePlugin(/* compiler options */),
  ],
});
```

## License

This work is licensed under [The MIT License](LICENSE).
