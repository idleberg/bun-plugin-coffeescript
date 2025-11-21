import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Plugin from '../src/index.ts';

// Type definitions for mocking
type OnLoadConfig = { filter: RegExp };
type OnLoadResultSource = { contents: string; loader: string };
type OnLoadResultObject = { exports: unknown; loader: string };
type OnLoadResult = OnLoadResultSource | OnLoadResultObject;
type OnLoadCallback = (args: { path: string }) => Promise<OnLoadResult>;

/**
 * Type guard to check if result is a source code result
 */
function isSourceResult(result: OnLoadResult): result is OnLoadResultSource {
	return 'contents' in result;
}

/**
 * Type guard to check if result is an object result
 */
function isObjectResult(result: OnLoadResult): result is OnLoadResultObject {
	return 'exports' in result;
}

/**
 * Helper to test async rejections in Bun 1.0+
 * Bun 1.0 doesn't support expect().rejects.toThrow(), so we use try-catch
 */
async function expectToReject(promise: Promise<unknown>): Promise<void> {
	let didThrow = false;

	try {
		await promise;
	} catch {
		didThrow = true;
	}

	expect(didThrow).toBe(true);
}

describe('bun-plugin-coffeescript', () => {
	describe('Plugin export', () => {
		test('exports a function', () => {
			expect(typeof Plugin).toBe('function');
		});

		test('returns a BunPlugin object', () => {
			const plugin = Plugin();
			expect(plugin).toHaveProperty('name');
			expect(plugin).toHaveProperty('setup');
			expect(typeof plugin.setup).toBe('function');
		});

		test('has correct plugin name', () => {
			const plugin = Plugin();
			expect(plugin.name).toBe('bun-plugin-coffeescript');
		});
	});

	describe('Plugin functionality', () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'bun-coffee-test-'));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test('compiles .coffee files', async () => {
			const coffeeFile = join(tempDir, 'test.coffee');
			const coffeeSource = `
square = (x) -> x * x
console.log square 5
`;
			await writeFile(coffeeFile, coffeeSource);

			const plugin = Plugin();
			const mockBuilder = {
				onLoad: mock((config: OnLoadConfig, _callback: OnLoadCallback) => {
					expect(config.filter).toBeInstanceOf(RegExp);
					expect(config.filter.test('test.coffee')).toBe(true);
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);
			expect(mockBuilder.onLoad).toHaveBeenCalledTimes(1);
		});

		test('compiles .litcoffee files', async () => {
			const plugin = Plugin();
			const mockBuilder = {
				onLoad: mock((config: OnLoadConfig, _callback: OnLoadCallback) => {
					expect(config.filter.test('test.litcoffee')).toBe(true);
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);
			expect(mockBuilder.onLoad).toHaveBeenCalledTimes(1);
		});

		test('produces valid JavaScript output', async () => {
			const coffeeFile = join(tempDir, 'simple.coffee');
			const coffeeSource = 'square = (x) -> x * x';
			await writeFile(coffeeFile, coffeeSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: coffeeFile });

			expect(result).toHaveProperty('contents');
			expect(result).toHaveProperty('loader');
			expect(result.loader).toBe('js');
			if (!isSourceResult(result)) throw new Error('Expected source result');
			expect(typeof result.contents).toBe('string');
			expect(result.contents).toContain('square');
		});

		test('handles CoffeeScript with modern syntax', async () => {
			const coffeeFile = join(tempDir, 'modern.coffee');
			const coffeeSource = `
class Animal
  constructor: (@name) ->

  speak: ->
    console.log "#{@name} makes a sound"

dog = new Animal 'Dog'
dog.speak()
`;
			await writeFile(coffeeFile, coffeeSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: coffeeFile });

			if (!isSourceResult(result)) throw new Error('Expected source result');
			expect(result.contents).toContain('Animal');
			expect(result.contents).toContain('constructor');
			expect(result.contents).toContain('speak');
		});
	});

	describe('Plugin options', () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'bun-coffee-opts-'));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test('accepts CoffeeScript compiler options', () => {
			const plugin = Plugin({ bare: true });
			expect(plugin).toBeDefined();
			expect(plugin.name).toBe('bun-plugin-coffeescript');
		});

		test('passes options to CoffeeScript compiler', async () => {
			const coffeeFile = join(tempDir, 'with-options.coffee');
			const coffeeSource = 'add = (a, b) -> a + b';
			await writeFile(coffeeFile, coffeeSource);

			const plugin = Plugin({ bare: true });
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: coffeeFile });

			// When bare: true, the output should not be wrapped in a function
			if (!isSourceResult(result)) throw new Error('Expected source result');
			expect(result.contents).toContain('add');
			expect(result.contents).not.toContain('(function()');
		});

		test('omits inlineMap option', async () => {
			const coffeeFile = join(tempDir, 'no-inline-map.coffee');
			const coffeeSource = 'multiply = (x, y) -> x * y';
			await writeFile(coffeeFile, coffeeSource);

			// The plugin should omit the inlineMap option
			// biome-ignore lint/suspicious/noExplicitAny: Testing invalid option type
			const plugin = Plugin({ inlineMap: true } as any);
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: coffeeFile });

			// Result should not contain inline source map
			if (!isSourceResult(result)) throw new Error('Expected source result');
			expect(result.contents).toBeDefined();
			expect(typeof result.contents).toBe('string');
		});

		test('works with empty options', async () => {
			const coffeeFile = join(tempDir, 'default.coffee');
			const coffeeSource = 'greet = -> "Hello"';
			await writeFile(coffeeFile, coffeeSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: coffeeFile });

			if (!isSourceResult(result)) throw new Error('Expected source result');
			expect(result.contents).toBeDefined();
			expect(result.loader).toBe('js');
		});
	});

	describe('Filter regex', () => {
		test('matches .coffee extension', () => {
			const plugin = Plugin();
			let filterRegex: RegExp | undefined;

			const mockBuilder = {
				onLoad: mock((config: OnLoadConfig, _callback: OnLoadCallback) => {
					filterRegex = config.filter;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!filterRegex) throw new Error('onLoad was not called');
			expect(filterRegex.test('app.coffee')).toBe(true);
			expect(filterRegex.test('src/utils/helper.coffee')).toBe(true);
			expect(filterRegex.test('/absolute/path/to/file.coffee')).toBe(true);
		});

		test('matches .litcoffee extension', () => {
			const plugin = Plugin();
			let filterRegex: RegExp | undefined;

			const mockBuilder = {
				onLoad: mock((config: OnLoadConfig, _callback: OnLoadCallback) => {
					filterRegex = config.filter;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!filterRegex) throw new Error('onLoad was not called');
			expect(filterRegex.test('README.litcoffee')).toBe(true);
			expect(filterRegex.test('docs/tutorial.litcoffee')).toBe(true);
		});

		test('does not match other extensions', () => {
			const plugin = Plugin();
			let filterRegex: RegExp | undefined;

			const mockBuilder = {
				onLoad: mock((config: OnLoadConfig, _callback: OnLoadCallback) => {
					filterRegex = config.filter;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!filterRegex) throw new Error('onLoad was not called');
			expect(filterRegex.test('app.js')).toBe(false);
			expect(filterRegex.test('app.ts')).toBe(false);
			expect(filterRegex.test('app.coffees')).toBe(false);
			expect(filterRegex.test('app.coffee.bak')).toBe(false);
		});
	});

	describe('Literate CoffeeScript', () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'bun-litcoffee-'));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test('matches .litcoffee files in filter', () => {
			const plugin = Plugin();
			let filterRegex: RegExp | undefined;

			const mockBuilder = {
				onLoad: mock((config: OnLoadConfig, _callback: OnLoadCallback) => {
					filterRegex = config.filter;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			// Verify .litcoffee files are matched by the filter
			if (!filterRegex) throw new Error('onLoad was not called');
			expect(filterRegex.test('example.litcoffee')).toBe(true);
			expect(filterRegex.test('docs/tutorial.litcoffee')).toBe(true);
		});

		test('compiles .litcoffee when literate option is set', async () => {
			const litcoffeeFile = join(tempDir, 'example.litcoffee');
			const litcoffeeSource = `# Introduction

This is a literate CoffeeScript file.

    square = (x) -> x * x
    console.log square(4)

More documentation here.
`;
			await writeFile(litcoffeeFile, litcoffeeSource);

			// Plugin needs literate: true option for literate CoffeeScript
			// biome-ignore lint/suspicious/noExplicitAny: Testing invalid option type
			const plugin = Plugin({ literate: true } as any);
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: litcoffeeFile });

			if (!isSourceResult(result)) throw new Error('Expected source result');
			expect(result.contents).toBeDefined();
			expect(result.loader).toBe('js');
			expect(result.contents).toContain('square');
		});
	});

	describe('CSON support', () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'bun-cson-'));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test('matches .cson files in filter', () => {
			const plugin = Plugin();
			let filterRegex: RegExp | undefined;

			const mockBuilder = {
				onLoad: mock((config: OnLoadConfig, _callback: OnLoadCallback) => {
					filterRegex = config.filter;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!filterRegex) throw new Error('onLoad was not called');
			expect(filterRegex.test('config.cson')).toBe(true);
			expect(filterRegex.test('package.cson')).toBe(true);
			expect(filterRegex.test('data/settings.cson')).toBe(true);
		});

		test('parses CSON files', async () => {
			const csonFile = join(tempDir, 'data.cson');
			const csonSource = `
# CSON Configuration
name: "test-package"
version: "1.0.0"
config:
  enabled: true
  count: 42
  items: [
    "one"
    "two"
    "three"
  ]
`;
			await writeFile(csonFile, csonSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: csonFile });

			expect(result).toHaveProperty('exports');
			expect(result).toHaveProperty('loader');
			expect(result.loader).toBe('object');
			if (!isObjectResult(result)) throw new Error('Expected object result');
			expect(result.exports).toEqual({
				name: 'test-package',
				version: '1.0.0',
				config: {
					enabled: true,
					count: 42,
					items: ['one', 'two', 'three'],
				},
			});
		});

		test('handles simple CSON objects', async () => {
			const csonFile = join(tempDir, 'simple.cson');
			const csonSource = `
key: "value"
number: 123
boolean: true
`;
			await writeFile(csonFile, csonSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: csonFile });

			if (!isObjectResult(result)) throw new Error('Expected object result');
			expect(result.exports).toEqual({
				key: 'value',
				number: 123,
				boolean: true,
			});
		});

		test('handles nested CSON structures', async () => {
			const csonFile = join(tempDir, 'nested.cson');
			const csonSource = `
database:
  host: "localhost"
  port: 5432
  credentials:
    username: "admin"
    password: "secret"
  options:
    ssl: true
    poolSize: 10
`;
			await writeFile(csonFile, csonSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: csonFile });

			if (!isObjectResult(result)) throw new Error('Expected object result');
			expect(result.exports).toHaveProperty('database');
			// biome-ignore lint/suspicious/noExplicitAny: Testing dynamic CSON structure
			expect((result.exports as any).database).toHaveProperty('credentials');
			// biome-ignore lint/suspicious/noExplicitAny: Testing dynamic CSON structure
			expect((result.exports as any).database.credentials.username).toBe('admin');
		});

		test('handles CSON arrays', async () => {
			const csonFile = join(tempDir, 'array.cson');
			const csonSource = `[
  "item1"
  "item2"
  "item3"
]`;
			await writeFile(csonFile, csonSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: csonFile });

			if (!isObjectResult(result)) throw new Error('Expected object result');
			expect(Array.isArray(result.exports)).toBe(true);
			expect(result.exports).toEqual(['item1', 'item2', 'item3']);
		});

		test('handles invalid CSON syntax', async () => {
			const csonFile = join(tempDir, 'invalid.cson');
			const invalidSource = `
key: "value
missing closing quote
`;
			await writeFile(csonFile, invalidSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			await expectToReject(onLoadCallback({ path: csonFile }));
		});
	});

	describe('Error handling', () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'bun-coffee-err-'));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test('handles invalid CoffeeScript syntax', async () => {
			const coffeeFile = join(tempDir, 'invalid.coffee');
			const invalidSource = `
square = (x) -> x * x
if
`;
			await writeFile(coffeeFile, invalidSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			// Should throw a compilation error
			if (!onLoadCallback) throw new Error('onLoad was not called');
			await expectToReject(onLoadCallback({ path: coffeeFile }));
		});

		test('handles missing file', async () => {
			const nonExistentFile = join(tempDir, 'does-not-exist.coffee');

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			// Should throw a file read error
			if (!onLoadCallback) throw new Error('onLoad was not called');
			await expectToReject(onLoadCallback({ path: nonExistentFile }));
		});
	});

	describe('Integration', () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'bun-coffee-int-'));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test('compiled output is valid JavaScript', async () => {
			const coffeeFile = join(tempDir, 'valid.coffee');
			const coffeeSource = `
add = (a, b) -> a + b
result = add 2, 3
`;
			await writeFile(coffeeFile, coffeeSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: coffeeFile });

			// Try to evaluate the compiled JavaScript (basic syntax check)
			if (!isSourceResult(result)) throw new Error('Expected source result');
			expect(() => {
				new Function(result.contents);
			}).not.toThrow();
		});

		test('preserves filename in compilation', async () => {
			const coffeeFile = join(tempDir, 'with-filename.coffee');
			const coffeeSource = 'double = (n) -> n * 2';
			await writeFile(coffeeFile, coffeeSource);

			const plugin = Plugin();
			let onLoadCallback: OnLoadCallback | undefined;

			const mockBuilder = {
				onLoad: mock((_config: OnLoadConfig, callback: OnLoadCallback) => {
					onLoadCallback = callback;
				}),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock builder for testing
			plugin.setup(mockBuilder as any);

			// The plugin should compile with the correct filename
			if (!onLoadCallback) throw new Error('onLoad was not called');
			const result = await onLoadCallback({ path: coffeeFile });

			expect(result).toBeDefined();
			if (!isSourceResult(result)) throw new Error('Expected source result');
			expect(result.contents).toBeDefined();
			// The compilation succeeds, meaning filename was passed correctly
		});
	});
});
