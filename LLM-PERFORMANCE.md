# LLM Performance Optimization

This document describes the performance optimizations implemented to prevent LLM overload and improve system responsiveness.

## Performance Optimizations Implemented

### 1. Request Queue and Rate Limiting
- **Queue Management**: LLM requests are queued to prevent overwhelming the model
- **Rate Limiting**: Configurable requests per second limit (default: 2 req/sec)
- **Concurrent Limits**: Maximum concurrent requests to the LLM (default: 3)
- **Queue Size Limits**: Maximum queue size to prevent memory overflow (default: 50)

### 2. Circuit Breaker Pattern
- **Failure Detection**: Automatically opens circuit after consecutive failures
- **Recovery**: Automatically attempts to close circuit after timeout period
- **Fail Fast**: Rejects requests immediately when circuit is open

### 3. Token Usage Optimization
- **Concise Memory Context**: Reduced memory context size by ~60%
- **Optimized Prompts**: Shorter, more focused prompts for planning
- **Reduced Reflection**: Faster result extraction with less LLM reflection

### 4. Health Monitoring
- **Real-time Stats**: Queue size, active requests, success rates
- **Performance Metrics**: Request timing, token usage, failure rates
- **Circuit Breaker Status**: Current state and failure counts

## Environment Configuration

### Rate Limiting Settings
```bash
# Maximum concurrent LLM requests (default: 3)
LLM_MAX_CONCURRENT_REQUESTS=2

# Maximum requests per second (default: 2.0)
LLM_REQUESTS_PER_SECOND=1.5

# Maximum queue size before rejecting requests (default: 50)
LLM_MAX_QUEUE_SIZE=30
```

### Circuit Breaker Settings
```bash
# Open circuit after N consecutive failures (default: 5)
LLM_CIRCUIT_BREAKER_MAX_FAILURES=3

# Circuit timeout in milliseconds (default: 30000)
LLM_CIRCUIT_BREAKER_TIMEOUT_MS=60000
```

## Performance Recommendations

### For Heavy Load (High Job Rate)
```bash
# More conservative settings
LLM_MAX_CONCURRENT_REQUESTS=2
LLM_REQUESTS_PER_SECOND=1.0
LLM_MAX_QUEUE_SIZE=30
LLM_CIRCUIT_BREAKER_MAX_FAILURES=3
```

### For Light Load (Low Job Rate)
```bash
# More aggressive settings
LLM_MAX_CONCURRENT_REQUESTS=5
LLM_REQUESTS_PER_SECOND=3.0
LLM_MAX_QUEUE_SIZE=100
LLM_CIRCUIT_BREAKER_MAX_FAILURES=8
```

### For Unstable LLM (Frequent Timeouts)
```bash
# More protective settings
LLM_MAX_CONCURRENT_REQUESTS=1
LLM_REQUESTS_PER_SECOND=0.5
LLM_CIRCUIT_BREAKER_MAX_FAILURES=2
LLM_CIRCUIT_BREAKER_TIMEOUT_MS=60000
```

## Monitoring

### LLM Stats Endpoint
The system exposes LLM performance stats through the provider:
```typescript
const stats = llmProvider.getStats();
console.log('Queue size:', stats.queue.queueSize);
console.log('Circuit breaker open:', stats.circuitBreaker.isOpen);
```

### Key Metrics to Monitor
1. **Queue Size**: Should stay below max most of the time
2. **Circuit Breaker**: Should not be frequently opening
3. **Success Rate**: Should maintain >90% for stable operation
4. **Request Processing Time**: Monitor for increasing latency

## System Load Adjustment

### Reducing System Load
If the LLM is consistently overloaded:

1. **Reduce Job Generation Rate**:
   ```bash
   JOBS_PER_MIN=5  # Default is 10
   ```

2. **Increase Agent Population** (spreads load):
   ```bash
   POPULATION_SIZE=50  # More agents = less work per agent
   ```

3. **Reduce LLM Rate Limits**:
   ```bash
   LLM_REQUESTS_PER_SECOND=1.0
   LLM_MAX_CONCURRENT_REQUESTS=2
   ```

### Expected Behavior
- Queue size should average below 20% of max capacity
- Circuit breaker should open <1% of the time
- Request timeouts should be rare
- System should maintain steady job completion rates

## Troubleshooting

### High Queue Size
- Reduce `JOBS_PER_MIN` or `LLM_REQUESTS_PER_SECOND`
- Check LLM health and response times
- Consider increasing `LLM_MAX_CONCURRENT_REQUESTS` if LLM can handle it

### Frequent Circuit Breaker Opening
- Check LLM endpoint health
- Increase `LLM_CIRCUIT_BREAKER_TIMEOUT_MS`
- Reduce `LLM_MAX_CONCURRENT_REQUESTS`

### Low Job Completion Rate
- Check if circuit breaker is frequently open
- Monitor queue overflow (requests being rejected)
- Verify LLM endpoint is responsive