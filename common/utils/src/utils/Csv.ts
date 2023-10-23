import csvParser from 'csv-parser'
import { Readable } from 'stream'
import { File } from './File'

export class Csv {
	/**
	 * Converts the csv file into an array of objects
	 * @param file
	 * @returns array of objects
	 */

	async parseCsvFile(file: Express.Multer.File, mappers?: {[key: string]: string}): Promise<any[]> {
		return new Promise((resolve, reject) => {
			const results = []
			const stream = Readable.from(file.buffer)

			stream
				.pipe(csvParser({
					mapHeaders: ({ header }) => {

						if (header.charCodeAt(0) === 0xFEFF) {
							header = header.replace(/^\uFEFF/gm, "");
						}

						return mappers?.[header] ?? header
					}
				}))
				.on('data', data => results.push(data))
				.on('end', () => resolve(results))
				.on('error', error => reject(error))
		})
	}

	/**
	 * Create a temporary csv file from a string, useful for testing
	 * @param content string
	 * @returns void
	 */

	async createTempCSVFileFromString(
		content: string,
	): Promise<{ 
		filePath: string, 
		csv_file: Express.Multer.File,
		dirPath: string,
	}> {
		try {

			const file = new File()
			const result = await file.createTempFileFromString({
				fileName: 'temp-file.csv', 
				content: content, 
				mimetype: 'text/csv'})

			return {
				filePath: result.filePath,
				csv_file: result.file,
				dirPath: result.dirPath
			}

		} catch (error) {
			throw new Error(`Error creating temporary file: ${error}`)
		}
	}
}
