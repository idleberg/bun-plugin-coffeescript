import type { BunPlugin, OnLoadResultObject, OnLoadResultSourceCode } from 'bun';
import { compile, type Options } from 'coffeescript';
import CSON from 'cson-parser';

function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
	return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key as K))) as Omit<T, K>;
}

async function loadCson(path: string): Promise<OnLoadResultObject> {
	const fileContents = await Bun.file(path).text();

	const exports = CSON.parse(fileContents);

	return {
		exports,
		loader: 'object',
	};
}

async function loadCoffeeScript(path: string, options: Options): Promise<OnLoadResultSourceCode> {
	const fileContents = await Bun.file(path).text();
	const compilerOptions = omit(options, ['inlineMap']);

	const contents = compile(fileContents, {
		filename: path,
		...compilerOptions,
	});

	return {
		contents,
		loader: 'js',
	};
}

export default function Plugin(options: Options = {}): BunPlugin {
	return {
		name: 'bun-plugin-coffeescript',
		setup(builder) {
			builder.onLoad({ filter: /\.(coffee|cson|litcoffee)$/ }, async ({ path }) => {
				if (path.endsWith('.cson')) {
					return loadCson(path);
				}

				return loadCoffeeScript(path, options);
			});
		},
	};
}
