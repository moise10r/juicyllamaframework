module.exports = {
	extends: ['../.eslintrc.js', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: 'tsconfig.json',
		sourceType: 'module',
	},
	env: {
		node: true,
		jest: true,
	},
}
