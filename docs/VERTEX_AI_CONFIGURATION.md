# Vertex AI Configuration Guide

This guide explains how to configure and use Google Vertex AI with LangGraph agents.

## Quick Setup

### 1. Environment Variables

Add these to your `.env` file:

```bash
# Switch to Vertex AI
LLM_PROVIDER=vertex

# GCP Configuration
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1

# Authentication (choose one method)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
# OR
GOOGLE_CLOUD_CREDENTIALS=base64_encoded_json_credentials

# Model Configuration
VERTEX_AI_MODEL=gemini-1.5-flash
VERTEX_AI_TEMPERATURE=0.7
VERTEX_AI_MAX_OUTPUT_TOKENS=1000
```

### 2. GCP Setup

1. **Create/Select GCP Project**: https://console.cloud.google.com/
2. **Enable Vertex AI API**: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com
3. **Create Service Account**:
   - Go to IAM & Admin > Service Accounts
   - Create new service account
   - Grant role: "Vertex AI User"
   - Download JSON key file

## Model Options

### Recommended Models

| Model | Cost | Speed | Use Case |
|-------|------|-------|----------|
| **gemini-1.5-flash** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **Recommended** - Best balance |
| gemini-1.5-flash-8b | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Cheapest - Good for simple tasks |
| gemini-1.5-pro | ⭐⭐⭐ | ⭐⭐⭐⭐ | Most capable - Complex reasoning |

### Model Configuration

```bash
# Ultra-fast and cheap (recommended for development)
VERTEX_AI_MODEL=gemini-1.5-flash
VERTEX_AI_TEMPERATURE=0.7
VERTEX_AI_MAX_OUTPUT_TOKENS=1000

# Even cheaper for simple tasks
VERTEX_AI_MODEL=gemini-1.5-flash-8b
VERTEX_AI_TEMPERATURE=0.5
VERTEX_AI_MAX_OUTPUT_TOKENS=500

# High quality for complex reasoning
VERTEX_AI_MODEL=gemini-1.5-pro
VERTEX_AI_TEMPERATURE=0.3
VERTEX_AI_MAX_OUTPUT_TOKENS=2000
```

## Parameter Tuning

### Temperature Settings

- **0.0-0.3**: Deterministic, consistent responses (good for math, classification)
- **0.4-0.7**: Balanced creativity and consistency (recommended for most tasks)
- **0.8-1.0**: More creative and varied responses (good for content generation)
- **1.1-2.0**: Very creative, potentially inconsistent (experimental)

### Token Limits

- **500-1000**: Good for short responses (classification, simple planning)
- **1000-2000**: Standard responses (detailed plans, analysis)
- **2000-4000**: Long responses (complex reasoning, detailed explanations)

## Cost Optimization

### Current Pricing (as of 2024)

**Gemini 1.5 Flash:**
- Input: $0.000075 per 1K tokens
- Output: $0.0003 per 1K tokens
- **~$0.0005-0.002 per request**

### Cost Estimates

With 10 jobs/minute:
- **Light usage** (500 tokens avg): ~$0.50/hour
- **Medium usage** (1000 tokens avg): ~$1.00/hour  
- **Heavy usage** (2000 tokens avg): ~$2.00/hour

### Optimization Tips

1. **Use Flash over Pro** unless you need complex reasoning
2. **Lower max_output_tokens** for simple tasks
3. **Set temperature=0.3** for deterministic tasks
4. **Monitor usage** in GCP Console

## Authentication Methods

### Method 1: Service Account File (Recommended)

```bash
# Download JSON key from GCP Console
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account-key.json
```

### Method 2: Base64 Encoded Credentials

```bash
# Encode your JSON key file
base64 -i your-service-account-key.json

# Add to .env (single line)
GOOGLE_CLOUD_CREDENTIALS=ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudC...
```

### Method 3: Application Default Credentials (Local Development)

```bash
# Install gcloud CLI and authenticate
gcloud auth application-default login
```

## Performance Tuning

### For High Throughput

```bash
# Increase concurrency for cloud LLM
LLM_MAX_CONCURRENT_REQUESTS=10
LLM_REQUESTS_PER_SECOND=5
LLM_MAX_QUEUE_SIZE=200

# Higher job generation rate
JOBS_PER_MIN=20
```

### For Cost Control

```bash
# Conservative settings
LLM_MAX_CONCURRENT_REQUESTS=3
LLM_REQUESTS_PER_SECOND=2
JOBS_PER_MIN=10

# Use cheaper model
VERTEX_AI_MODEL=gemini-1.5-flash-8b
VERTEX_AI_MAX_OUTPUT_TOKENS=500
```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```
Error: Could not load the default credentials
```
**Solution**: Check your authentication method and credentials file path.

#### 2. Project Not Found
```
Error: Project not found or Vertex AI API not enabled
```
**Solution**: Enable Vertex AI API in your GCP project.

#### 3. Permission Denied
```
Error: Permission denied to access Vertex AI
```
**Solution**: Ensure service account has "Vertex AI User" role.

#### 4. Model Not Found
```
Error: Model not found
```
**Solution**: Check model name spelling and availability in your region.

### Debug Mode

Enable debug logging:

```bash
# Add to .env for detailed logging
VERTEX_AI_DEBUG=true
```

## Monitoring

### GCP Console Monitoring

1. **API Usage**: Cloud Console > APIs & Services > Metrics
2. **Costs**: Billing > Cost Management
3. **Quotas**: IAM & Admin > Quotas

### Application Monitoring

The LangGraph agent provides built-in metrics:

```typescript
// Check if Vertex AI is configured
console.log('Vertex AI configured:', LangGraphAgent.isVertexAIConfigured());

// Monitor performance in logs
// [LangGraphAgent] Initializing Vertex AI with model: gemini-1.5-flash...
```

## Migration from Local LLM

When switching from local to Vertex AI:

1. **Update .env**:
   ```bash
   # Change from
   LLM_PROVIDER=local
   
   # To
   LLM_PROVIDER=vertex
   ```

2. **Adjust performance settings** (much higher throughput possible)

3. **Test with small job rate first**, then scale up

4. **Monitor costs** in GCP Console

The system will automatically fallback to SimpleAgent if Vertex AI is not properly configured.