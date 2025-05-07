/**
 * @type {(dir: string, mode: 'frontend' | undefined) => import('@types/eslint').ESLint.ConfigData}
 */
module.exports = (tsconfigRootDir, mode) => {
	const isFrontend = mode === 'frontend';
	const parser = isFrontend ? 'vue-eslint-parser' : '@typescript-eslint/parser';
	const extraParserOptions = isFrontend
		? {
				extraFileExtensions: ['.vue'],
				parser: {
					ts: '@typescript-eslint/parser',
					js: '@typescript-eslint/parser',
					vue: 'vue-eslint-parser',
					template: 'vue-eslint-parser',
				},
			}
		: {};

	const settings = {
		'import/parsers': {
			'@typescript-eslint/parser': ['.ts', '.tsx', '.d.ts'],
		},

		'import/resolver': {
			typescript: {
				alwaysTryTypes: true,
				tsconfigRootDir, // Correct: ES6 shorthand for the 'tsconfigRootDir' variable passed to the function
				project: './tsconfig.json',
			},
			node: {
				extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts', '.vue'],
			},
		},

		'import/extensions': ['.js', '.jsx', '.ts', '.tsx', '.vue'],
	};

	return {
		parser,
		parserOptions: {
			tsconfigRootDir,
			project: ['./tsconfig.json'],
			...extraParserOptions,
		},
		settings,
	};
};
