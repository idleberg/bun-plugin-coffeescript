import type { BunPlugin } from 'bun';
import { compile, type Options } from 'coffeescript';

function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
	return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key as K))) as Omit<T, K>;
}

export default function Plugin(options: Options = {}): BunPlugin {
	return {
		name: 'bun-plugin-coffeescript',
		setup(builder) {
			builder.onLoad({ filter: /\.(coffee|litcoffee)$/ }, async ({ path }) => {
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
			});
		},
	};
}
