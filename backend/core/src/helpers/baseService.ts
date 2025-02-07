import { Injectable } from '@nestjs/common'
import { Query } from '../utils/typeorm/Query'
import { DeepPartial, FindOneOptions, Repository, ObjectLiteral } from 'typeorm'
import { FindManyOptions } from 'typeorm/find-options/FindManyOptions'
import { BeaconService } from '../modules/beacon/beacon.service'
import { Cache } from 'cache-manager'
import { CachePeriod, JLCache, Logger } from '@juicyllama/utils'
import { ChartOptions, CurrencyOptions } from '../types/typeorm'
import { ImportMode, BulkUploadResponse } from '../types/common'

/**
 * Base service for all services
 *
 * * Calls the repository function
 * * If beacon is provided it will send a beacon
 * * If cache is provided it will use the cache
 */

@Injectable()
export class BaseService<T extends ObjectLiteral> {
	constructor(
		readonly query: Query<T>,
		readonly repository: Repository<T>,
		readonly options?: {
			beacon?: BeaconService
			cache?: {
				cacheManager: Cache
				field?: string //if no field is passed it will use the primary key
				ttl?: CachePeriod //if no ttl is passed it will default to 24 hours
			}
		},
	) {}

	/**
	 * Creates a new record in the database
	 * @param data
	 */

	async create(data: DeepPartial<T>): Promise<T> {
		const result = await this.query.create(this.repository, data)
		await this.cacheRecord(result)
		await this.sendBeacon({ action: 'CREATE', data: result })
		return result
	}

	/**
	 * Creates many new records in the database
	 * @param qty - number of records to create
	 * @param data - the data to create
	 */

	async createMany(qty: number, data: DeepPartial<T>): Promise<T[]> {
		const results = []

		for (let i = 0; i < qty; i++) {
			const result = await this.query.create(this.repository, data)
			results.push(result)
			await this.cacheRecord(result)
			await this.sendBeacon({ action: 'CREATE', data: result })
		}

		return results
	}

	/*
	 * Bulk insert, upsert or delete records into the database
	 * @param data
	 * @param import_mode
	 * @param dedup_field
	 */

	async bulk(data: DeepPartial<T>[], import_mode: ImportMode, dedup_field?: string): Promise<BulkUploadResponse> {
		return await this.query.bulk(this.repository, data, import_mode, dedup_field)
	}

	/**
	 * Finds all records by the options
	 * @param options
	 */

	async findAll(options?: FindManyOptions, currency?: CurrencyOptions<T>): Promise<T[]> {
		return await this.query.findAll(this.repository, options, currency)
	}

	/**
	 * Finds a single record by the options
	 * @param options
	 */

	async findOne(options?: FindOneOptions, currency?: CurrencyOptions<T>): Promise<T> {
		let result = await this.cacheFindOne(options)
		if (result) return result

		result = await this.query.findOne(this.repository, options, currency)
		if (result) await this.cacheRecord(result)
		return result
	}

	/**
	 * Finds the record by the id
	 * @param id
	 * @param relations
	 */

	async findById(id: number, relations?: string[], currency?: CurrencyOptions<T>): Promise<T> {
		if (!id) {
			throw new Error('ID is required')
		}
		let result = await this.cacheFindById(id)
		if (result) return result

		result = await this.query.findOneById(this.repository, id, relations, currency)
		if (result) await this.cacheRecord(result)
		return result
	}

	/**
	 * Counts the number of records in the database
	 * @param options
	 */

	async count(options?: FindManyOptions): Promise<number> {
		return await this.query.count(this.repository, options)
	}

	/**
	 * Sums the metric by the options
	 * @param metric
	 * @param options
	 */

	async sum(metric: string, options?: FindManyOptions): Promise<number> {
		return await this.query.sum(this.repository, metric, options)
	}

	/**
	 * Averages the metric by the options
	 * @param metric
	 * @param options
	 */

	async avg(metric: string, options?: FindManyOptions): Promise<number> {
		return await this.query.avg(this.repository, metric, options)
	}

	/**
	 * Averages the metric by the options
	 * @param field
	 * @param options
	 */

	async charts(field: string, options?: ChartOptions, currency?: CurrencyOptions<T>): Promise<any> {
		return await this.query.charts(this.repository, field, options || {}, currency)
	}

	/**
	 * Updates the record in the database
	 * @param data
	 */

	async update(data: DeepPartial<T>): Promise<T> {
		const result = await this.query.update(this.repository, data)
		await this.cacheRecord(result)
		await this.sendBeacon({ action: 'UPDATE', data: result })
		return result
	}

	/**
	 * Soft delete, can be restored if needed
	 * @param record
	 */

	async remove(record: T): Promise<T> {
		const result = await this.query.remove(this.repository, record)
		await this.cacheDelete(record)
		await this.sendBeacon({ action: 'DELETE', data: result })
		return result
	}

	/**
	 * Deletes the record from the database can cannot be recovered
	 * @param record
	 */

	async purge(record: T): Promise<void> {
		await this.query.purge(this.repository, record)
		await this.cacheDelete(record)
		await this.sendBeacon({ action: 'DELETE', data: record })
	}

	async raw(sql: string) {
		return await this.query.raw(this.repository, sql)
	}

	/**
	 * Sends out a beacon to the beacon service if provided
	 * @param options
	 */
	async sendBeacon(options: { action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RELOAD'; data: T }) {
		if (this.options?.beacon) {
			await this.options?.beacon.sendPush(this.query.getEventName(this.repository, options.data), options)
		}
	}

	/**
	 * Gets the cache key to use for this entry
	 * @param value the value of the field to use
	 */
	getCacheKey(value: any): string {
		return JLCache.cacheKey(`database`, this.query.getTableName(this.repository), {
			[this.getCacheField()]: value,
		})
	}

	/**
	 * Gets the cache ttl to use for this entry
	 */
	getCacheTTL(): CachePeriod {
		return this.options?.cache?.ttl || CachePeriod.DAY
	}

	getCacheField(): keyof T {
		return this.options?.cache?.field || this.query.getPrimaryKey(this.repository)
	}

	/**
	 * Adds the record to the cache service if provided
	 * @param record
	 */
	async cacheRecord(record: T) {
		try {
			if (this.options?.cache?.cacheManager && this.getCacheKey(record[this.getCacheField()])) {
				await this.options.cache.cacheManager.set(
					this.getCacheKey(record[this.getCacheField()]),
					record,
					this.getCacheTTL(),
				)
			}
		} catch (e) {
			const error = e as Error
			const logger = new Logger()
			logger.error(`[core::baseService::cacheRecord] ${error.message}`, error)
		}
	}

	/**
	 * Finds a record in the cache service if provided and where includes the cacheField
	 * @param options
	 */
	async cacheFindOne(options?: FindOneOptions<T>): Promise<T | undefined> {
		if (this.options?.cache?.cacheManager && options?.where && this.getCacheField() !== undefined) {
			const cacheKey = (Array.isArray(options.where) ? options.where[0] : options.where)[this.getCacheField()]
			if (cacheKey) {
				return await this.options.cache.cacheManager.get<T>(cacheKey as string)
			}
		}
		return undefined
	}

	/**
	 * Finds a record in the cache service if provided and cacheField is primary key or not provided
	 * @param id
	 */

	async cacheFindById(id: number): Promise<T | undefined> {
		if (this.options?.cache?.cacheManager && this.getCacheField() === this.query.getPrimaryKey(this.repository)) {
			return await this.options.cache.cacheManager.get(this.getCacheKey(id))
		}
		return
	}

	/**
	 * Adds the record to the cache service if provided
	 * @param record
	 */
	async cacheDelete(record: T) {
		if (this.options?.cache?.cacheManager && this.getCacheKey(record[this.getCacheField()])) {
			await this.options.cache.cacheManager.del(this.getCacheKey(record[this.getCacheField()]))
		}
	}
}
