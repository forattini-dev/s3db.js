import { BaseHandler } from '../base-handler.js';

/**
 * Handler for advanced query operations
 */
export class QueryHandler extends BaseHandler {
  constructor(database) {
    super(database);
    this.queries = new Map();
  }

  /**
   * Create a new query builder
   */
  async create(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName']);

    const { resourceName, queryId } = args;
    const id = queryId || this.generateQueryId();
    
    const query = {
      id,
      resourceName,
      filters: [],
      sort: [],
      projection: null,
      aggregation: [],
      limit: 100,
      offset: 0,
      createdAt: Date.now()
    };
    
    this.queries.set(id, query);
    
    return this.formatResponse({
      queryId: id,
      resourceName
    }, {
      message: `Query builder created for resource: ${resourceName}`
    });
  }

  /**
   * Add filter to query
   */
  async filter(args) {
    this.validateParams(args, ['queryId', 'field', 'operator', 'value']);

    const { queryId, field, operator, value, combineWith = 'AND' } = args;
    const query = this.getQuery(queryId);
    
    const validOperators = [
      'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
      'in', 'nin', 'contains', 'startsWith',
      'endsWith', 'regex', 'exists', 'type'
    ];
    
    if (!validOperators.includes(operator)) {
      throw new Error(`Invalid operator: ${operator}. Valid: ${validOperators.join(', ')}`);
    }
    
    query.filters.push({
      field,
      operator,
      value,
      combineWith
    });
    
    return this.formatResponse({
      queryId,
      filters: query.filters
    });
  }

  /**
   * Add sorting to query
   */
  async sort(args) {
    this.validateParams(args, ['queryId', 'field']);

    const { queryId, field, direction = 'asc' } = args;
    const query = this.getQuery(queryId);
    
    if (!['asc', 'desc'].includes(direction)) {
      throw new Error(`Invalid sort direction: ${direction}. Use 'asc' or 'desc'`);
    }
    
    query.sort.push({ field, direction });
    
    return this.formatResponse({
      queryId,
      sort: query.sort
    });
  }

  /**
   * Set field projection
   */
  async project(args) {
    this.validateParams(args, ['queryId', 'fields']);

    const { queryId, fields, exclude = false } = args;
    const query = this.getQuery(queryId);
    
    query.projection = {
      fields: Array.isArray(fields) ? fields : [fields],
      exclude
    };
    
    return this.formatResponse({
      queryId,
      projection: query.projection
    });
  }

  /**
   * Execute query
   */
  async execute(args) {
    this.ensureConnected();
    this.validateParams(args, ['queryId']);

    const { queryId, limit, offset, explain = false } = args;
    const query = this.getQuery(queryId);
    const resource = this.getResource(query.resourceName);
    
    // Update pagination
    if (limit !== undefined) query.limit = limit;
    if (offset !== undefined) query.offset = offset;
    
    // Build execution plan
    const plan = this.buildExecutionPlan(query);
    
    if (explain) {
      return this.formatResponse({
        queryId,
        plan,
        estimatedCost: this.estimateQueryCost(plan, resource)
      });
    }
    
    // Execute query
    const startTime = Date.now();
    const results = await this.executeQuery(resource, plan);
    const executionTime = Date.now() - startTime;
    
    return this.formatResponse({
      documents: results,
      count: results.length
    }, {
      queryId,
      executionTime,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: results.length === query.limit
      }
    });
  }

  /**
   * Perform aggregation
   */
  async aggregate(args) {
    this.ensureConnected();
    this.validateParams(args, ['resourceName', 'pipeline']);

    const { resourceName, pipeline } = args;
    const resource = this.getResource(resourceName);
    
    const results = await this.executeAggregation(resource, pipeline);
    
    return this.formatResponse({
      results,
      pipeline
    });
  }

  /**
   * Build complex query from natural language
   */
  async buildFromText(args) {
    this.validateParams(args, ['resourceName', 'query']);

    const { resourceName, query } = args;
    const queryId = this.generateQueryId();
    
    // Parse natural language query
    const parsed = this.parseNaturalQuery(query);
    
    // Create query
    await this.create({ resourceName, queryId });
    
    // Apply parsed conditions
    for (const filter of parsed.filters) {
      await this.filter({ queryId, ...filter });
    }
    
    if (parsed.sort) {
      await this.sort({ queryId, ...parsed.sort });
    }
    
    if (parsed.projection) {
      await this.project({ queryId, ...parsed.projection });
    }
    
    return this.formatResponse({
      queryId,
      parsed,
      query: this.getQuery(queryId)
    }, {
      message: 'Query built from text successfully'
    });
  }

  // Private helper methods

  private getQuery(queryId) {
    const query = this.queries.get(queryId);
    if (!query) {
      throw new Error(`Query ${queryId} not found`);
    }
    return query;
  }

  private generateQueryId() {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private buildExecutionPlan(query) {
    return {
      resource: query.resourceName,
      filters: query.filters,
      sort: query.sort,
      projection: query.projection,
      aggregation: query.aggregation,
      limit: query.limit,
      offset: query.offset,
      indexes: this.identifyUsableIndexes(query)
    };
  }

  private async executeQuery(resource, plan) {
    // Get all documents (in production, this would be optimized)
    let results = await resource.list({ limit: 10000 });
    
    // Apply filters
    results = this.applyFilters(results, plan.filters);
    
    // Apply sorting
    if (plan.sort && plan.sort.length > 0) {
      results = this.applySorting(results, plan.sort);
    }
    
    // Apply projection
    if (plan.projection) {
      results = this.applyProjection(results, plan.projection);
    }
    
    // Apply pagination
    results = results.slice(plan.offset, plan.offset + plan.limit);
    
    return results;
  }

  private applyFilters(data, filters) {
    if (!filters || filters.length === 0) return data;
    
    return data.filter(item => {
      let result = true;
      let previousCombine = 'AND';
      
      for (const filter of filters) {
        const matches = this.evaluateFilter(item, filter);
        
        if (previousCombine === 'AND') {
          result = result && matches;
        } else {
          result = result || matches;
        }
        
        previousCombine = filter.combineWith || 'AND';
      }
      
      return result;
    });
  }

  private evaluateFilter(item, filter) {
    const value = this.getNestedValue(item, filter.field);
    
    switch (filter.operator) {
      case 'eq': return value === filter.value;
      case 'ne': return value !== filter.value;
      case 'gt': return value > filter.value;
      case 'gte': return value >= filter.value;
      case 'lt': return value < filter.value;
      case 'lte': return value <= filter.value;
      case 'in': return Array.isArray(filter.value) && filter.value.includes(value);
      case 'nin': return Array.isArray(filter.value) && !filter.value.includes(value);
      case 'contains': return String(value).includes(filter.value);
      case 'startsWith': return String(value).startsWith(filter.value);
      case 'endsWith': return String(value).endsWith(filter.value);
      case 'regex': return new RegExp(filter.value).test(String(value));
      case 'exists': return filter.value ? value !== undefined : value === undefined;
      case 'type': return typeof value === filter.value;
      default: return true;
    }
  }

  private getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private applySorting(data, sortRules) {
    return [...data].sort((a, b) => {
      for (const rule of sortRules) {
        const aVal = this.getNestedValue(a, rule.field);
        const bVal = this.getNestedValue(b, rule.field);
        
        if (aVal === bVal) continue;
        
        const comparison = aVal < bVal ? -1 : 1;
        return rule.direction === 'asc' ? comparison : -comparison;
      }
      return 0;
    });
  }

  private applyProjection(data, projection) {
    return data.map(item => {
      if (projection.exclude) {
        const result = { ...item };
        projection.fields.forEach(field => {
          this.deleteNestedValue(result, field);
        });
        return result;
      } else {
        const result = { id: item.id }; // Always include ID
        projection.fields.forEach(field => {
          const value = this.getNestedValue(item, field);
          if (value !== undefined) {
            this.setNestedValue(result, field, value);
          }
        });
        return result;
      }
    });
  }

  private setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  private deleteNestedValue(obj, path) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => current?.[key], obj);
    if (target) delete target[lastKey];
  }

  private async executeAggregation(resource, pipeline) {
    const data = await resource.list({ limit: 10000 });
    let results = data;
    
    for (const stage of pipeline) {
      results = await this.executeAggregationStage(results, stage);
    }
    
    return results;
  }

  private async executeAggregationStage(data, stage) {
    switch (stage.stage) {
      case 'match':
        return this.applyFilters(data, stage.params.filters);
      
      case 'group':
        return this.groupData(data, stage.params);
      
      case 'sort':
        return this.applySorting(data, stage.params.rules);
      
      case 'limit':
        return data.slice(0, stage.params.count);
      
      case 'count':
        return [{ count: data.length }];
      
      case 'sum':
        return [{ sum: data.reduce((acc, item) => acc + (item[stage.params.field] || 0), 0) }];
      
      case 'avg':
        const sum = data.reduce((acc, item) => acc + (item[stage.params.field] || 0), 0);
        return [{ avg: sum / data.length }];
      
      case 'min':
        const min = Math.min(...data.map(item => item[stage.params.field] || Infinity));
        return [{ min }];
      
      case 'max':
        const max = Math.max(...data.map(item => item[stage.params.field] || -Infinity));
        return [{ max }];
      
      default:
        return data;
    }
  }

  private groupData(data, params) {
    const groups = new Map();
    
    for (const item of data) {
      const key = this.getNestedValue(item, params.by);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(item);
    }
    
    const results = [];
    for (const [key, items] of groups) {
      const group = { _id: key, count: items.length };
      
      // Apply aggregation functions
      if (params.aggregations) {
        for (const agg of params.aggregations) {
          if (agg.type === 'sum') {
            group[agg.name] = items.reduce((acc, item) => acc + (item[agg.field] || 0), 0);
          } else if (agg.type === 'avg') {
            const sum = items.reduce((acc, item) => acc + (item[agg.field] || 0), 0);
            group[agg.name] = sum / items.length;
          }
        }
      }
      
      results.push(group);
    }
    
    return results;
  }

  private estimateQueryCost(plan, resource) {
    let cost = 0;
    
    // Base cost for scanning
    cost += 0.0004; // LIST operation
    
    // Additional costs for complexity
    if (plan.filters.length > 0) cost += 0.0001 * plan.filters.length;
    if (plan.sort.length > 0) cost += 0.0002;
    if (plan.aggregation.length > 0) cost += 0.0003 * plan.aggregation.length;
    
    return {
      estimatedCostUSD: cost,
      operations: {
        list: 1,
        filters: plan.filters.length,
        sort: plan.sort.length > 0 ? 1 : 0,
        aggregation: plan.aggregation.length
      }
    };
  }

  private identifyUsableIndexes(query) {
    // In a real implementation, this would check for actual indexes
    const indexes = [];
    
    for (const filter of query.filters) {
      if (filter.operator === 'eq') {
        indexes.push({
          field: filter.field,
          type: 'equality'
        });
      }
    }
    
    return indexes;
  }

  private parseNaturalQuery(text) {
    const parsed = {
      filters: [],
      sort: null,
      projection: null
    };
    
    // Simple pattern matching (in production, use NLP)
    const patterns = {
      equals: /(\w+)\s+(?:is|equals?|=)\s+['"]?([^'"]+)['"]?/gi,
      greater: /(\w+)\s+(?:greater than|>)\s+(\d+)/gi,
      less: /(\w+)\s+(?:less than|<)\s+(\d+)/gi,
      contains: /(\w+)\s+contains\s+['"]?([^'"]+)['"]?/gi,
      sort: /sort(?:ed)?\s+by\s+(\w+)\s*(asc|desc)?/i,
      fields: /(?:select|show|return)\s+([\w,\s]+)/i
    };
    
    // Extract filters
    let match;
    while ((match = patterns.equals.exec(text))) {
      parsed.filters.push({
        field: match[1],
        operator: 'eq',
        value: match[2]
      });
    }
    
    // Extract sorting
    if ((match = patterns.sort.exec(text))) {
      parsed.sort = {
        field: match[1],
        direction: match[2] || 'asc'
      };
    }
    
    // Extract projection
    if ((match = patterns.fields.exec(text))) {
      parsed.projection = {
        fields: match[1].split(',').map(f => f.trim()),
        exclude: false
      };
    }
    
    return parsed;
  }
}