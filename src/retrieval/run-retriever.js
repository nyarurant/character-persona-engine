'use strict';

async function runRetriever(retriever, items, query, k, context = {}) {
  if (typeof retriever === 'function') return retriever(items, query, k, context);
  if (retriever && typeof retriever.retrieve === 'function') return retriever.retrieve(items, query, k, context);
  throw new TypeError('retriever must be a function or expose retrieve()');
}

module.exports = { runRetriever };
