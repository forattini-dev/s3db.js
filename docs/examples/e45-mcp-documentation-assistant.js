/**
 * MCP Documentation Assistant - Example
 * Shows how AI agents can use the s3dbQueryDocs tool to learn about s3db.js
 *
 * Similar to NX MCP's nx_docs tool
 *
 * Run this example to see how the documentation query works
 */

import { createDocumentationHandlers } from '../../mcp/tools/documentation.js';

// Create documentation handlers (normally done by MCP server)
const handlers = createDocumentationHandlers({});

console.log('='.repeat(80));
console.log('s3db.js MCP Documentation Assistant');
console.log('Similar to NX MCP - Self-service docs for AI agents');
console.log('='.repeat(80));
console.log();

// Example 1: Query about CachePlugin
console.log('📚 Example 1: "How do I use the CachePlugin?"\n');
const cacheResult = await handlers.s3dbQueryDocs({
  query: 'How do I use the CachePlugin?',
  maxResults: 3
});

console.log(`Found: ${cacheResult.found}`);
console.log(`Results: ${cacheResult.resultCount} total, showing ${cacheResult.showing}\n`);

cacheResult.results.forEach((result, i) => {
  console.log(`${i + 1}. ${result.file} (score: ${result.relevanceScore})`);
  result.sections.forEach((section, j) => {
    console.log(`   Section ${j + 1}: ${section.header}`);
    console.log(`   ${section.content.substring(0, 200)}...\n`);
  });
});

console.log('\n' + '='.repeat(80) + '\n');

// Example 2: Query about partitions
console.log('📚 Example 2: "What are partitions and when should I use them?"\n');
const partitionResult = await handlers.s3dbQueryDocs({
  query: 'What are partitions and when should I use them?',
  maxResults: 2
});

console.log(`Found: ${partitionResult.found}`);
console.log(`Results: ${partitionResult.resultCount} total\n`);

partitionResult.results.forEach((result, i) => {
  console.log(`${i + 1}. ${result.file}`);
  console.log(`   Relevance Score: ${result.relevanceScore}`);
  console.log(`   Sections found: ${result.sections.length}\n`);
});

console.log('\n' + '='.repeat(80) + '\n');

// Example 3: List all available topics
console.log('📚 Example 3: List all available topics\n');
const topicsResult = await handlers.s3dbListTopics({});

console.log(`Success: ${topicsResult.success}`);
console.log(`Message: ${topicsResult.message}\n`);

console.log('Categories:');
Object.entries(topicsResult.categories).forEach(([category, topics]) => {
  console.log(`  ${category}: ${topics.length} topics`);
  console.log(`    - ${topics.slice(0, 3).join(', ')}${topics.length > 3 ? ', ...' : ''}`);
});

console.log(`\nTotal topics indexed: ${topicsResult.totalTopics}`);
console.log(`Total files available: ${topicsResult.totalFiles}\n`);

console.log('Example queries you can try:');
topicsResult.examples.forEach((example, i) => {
  console.log(`  ${i + 1}. "${example.query}"`);
  console.log(`     ${example.description}\n`);
});

console.log('\n' + '='.repeat(80) + '\n');

// Example 4: Query that returns no results (to show fallback)
console.log('📚 Example 4: Query with no results (shows suggestions)\n');
const noResultsQuery = await handlers.s3dbQueryDocs({
  query: 'quantum blockchain AI crypto metaverse'
});

console.log(`Found: ${noResultsQuery.found}`);
console.log(`Message: ${noResultsQuery.message}\n`);

if (noResultsQuery.suggestions) {
  console.log('Try these instead:');
  noResultsQuery.suggestions.forEach((suggestion, i) => {
    console.log(`  ${i + 1}. ${suggestion}`);
  });
}

console.log('\n' + '='.repeat(80));
console.log('✅ MCP Documentation Assistant Demo Complete');
console.log('='.repeat(80));

/**
 * How this compares to NX MCP:
 *
 * NX MCP has "nx_docs" tool that agents use to learn about Nx features.
 * s3db.js now has the same thing with "s3dbQueryDocs" and "s3dbListTopics".
 *
 * Benefits:
 * - AI agents can learn about s3db.js on-demand
 * - No need to read entire documentation upfront
 * - Intelligent search with relevance scoring
 * - Categorized topics for easy discovery
 * - Examples and suggestions when queries fail
 *
 * Usage in AI conversations:
 *
 * User: "I want to use s3db.js but don't know where to start"
 * AI: *calls s3dbListTopics()*
 *     "Here are the main categories: core, operations, plugins..."
 *
 * User: "How do I cache data?"
 * AI: *calls s3dbQueryDocs("cache")*
 *     "Based on the docs, you can use CachePlugin like this..."
 *
 * User: "What about partitioning?"
 * AI: *calls s3dbQueryDocs("partitioning")*
 *     "Partitions allow O(1) lookups. Here's how to set them up..."
 */
