import { includeIgnoreFile } from '@eslint/compat';
import typescriptEslint from 'typescript-eslint';
import * as path from 'path';
import { defineConfig } from 'eslint/config';
export default defineConfig([
    includeIgnoreFile(path.resolve(import.meta.dirname, '.gitignore')),
    ...typescriptEslint.configs.strictTypeChecked,
    ...typescriptEslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },

        rules: {
            '@typescript-eslint/restrict-template-expressions': [
                'error',
                {
                    allowNumber: true,
                    allowRegExp: true,
                },
            ],
            '@typescript-eslint/no-empty-object-type': [
                'error',
                {
                    allowInterfaces: 'always',
                },
            ],
        },
    },
]);
