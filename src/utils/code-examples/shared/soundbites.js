/**
 * Soundbite operations examples (shared across all partner types)
 */

import { ExampleGenerator, CommonTemplates } from '../common/helpers.js';

/**
 * Soundbite operations for audio content and payment integration
 */
export const SoundbiteOperations = {
  register_audio: {
    description: 'Register audio content for soundbite transactions',
    endpoint: '/products/{id}/audios/upload',
    method: 'POST',
    contentType: 'multipart/form-data',
    sampleBody: {
      file: '@/path/to/audio.mp3'
    }
  },

  get_audio: {
    description: 'Get audio content details',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'GET',
    sampleBody: null
  },

  update_audio: {
    description: 'Update audio content metadata',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'PATCH',
    sampleBody: {
      title: 'Updated Audio Title',
      productId: 'pr_new_product_123'
    }
  },

  delete_audio: {
    description: 'Delete audio content',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'DELETE',
    sampleBody: null
  },

  list_audios: {
    description: 'List audio content for product',
    endpoint: '/products/{id}/audios',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      format: 'MP3',
      quality: 'HIGH',
      limit: 20,
      offset: 0
    }
  },

  create_soundbite_transaction: {
    description: 'Create transaction for soundbite purchase',
    endpoint: '/transactions/soundbite',
    method: 'POST',
    sampleBody: {
      trData: {
        amount: '2.99',
        currency: 'EUR',
        reasonL1: 'Soundbite Purchase',
        reasonL2: 'Premium audio content'
      },
      soundbiteData: {
        productId: 'pr_audio_123',
        audioId: 'aud_content_456',
        accessType: 'STREAM_ONLY',
        duration: 180,
        quality: 'HIGH'
      },
      trOptions: {
        type: 'SOUNDBITE',
        timeToLive: 300,
        autoComplete: true,
        deliveryMethod: 'INSTANT_STREAM'
      }
    }
  },

  stream_audio: {
    description: 'Stream audio content after purchase',
    endpoint: '/soundbites/{id}/stream',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      quality: 'HIGH',
      format: 'MP3',
      startTime: 0,
      duration: 180
    },
    responseType: 'audio'
  },

  download_audio: {
    description: 'Download purchased audio content',
    endpoint: '/soundbites/{id}/download',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      quality: 'HIGHEST',
      format: 'FLAC'
    },
    responseType: 'file'
  },

  get_soundbite_analytics: {
    description: 'Get analytics for soundbite transactions',
    endpoint: '/soundbites/analytics',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      period: '30d',
      metrics: 'purchases,streams,revenue',
      productId: 'pr_audio_123',
      groupBy: 'day'
    }
  },

  create_audio_playlist: {
    description: 'Create playlist from multiple audio contents',
    endpoint: '/soundbites/playlists',
    method: 'POST',
    sampleBody: {
      playlistData: {
        name: 'Premium Collection',
        description: 'Curated premium audio content',
        isPublic: false,
        category: 'PREMIUM'
      },
      audioItems: [
        {
          audioId: 'aud_content_001',
          position: 1,
          startTime: 0,
          endTime: 180
        },
        {
          audioId: 'aud_content_002',
          position: 2,
          startTime: 30,
          endTime: 210
        }
      ],
      playlistOptions: {
        shuffle: false,
        repeat: false,
        autoPlay: true,
        crossfade: 2
      }
    }
  },

  get_audio_preview: {
    description: 'Get preview of audio content before purchase',
    endpoint: '/products/{id}/audios/{audioId}/preview',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      duration: 30,
      startTime: 60,
      quality: 'MEDIUM'
    },
    responseType: 'audio'
  }
};

/**
 * Python Soundbites Generator
 */
export class PythonSoundbitesGenerator extends ExampleGenerator {
  constructor() {
    super('python');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = SoundbiteOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const {
      productId = 'pr_audio_123',
      audioId = 'aud_content_456',
      soundbiteId = 'sb_transaction_789',
      playlistId = 'pl_collection_012',
      ...otherParams
    } = params;

    let endpoint = opConfig.endpoint;
    endpoint = endpoint.replace('{id}', productId);
    endpoint = endpoint.replace('{audioId}', audioId);
    endpoint = endpoint.replace('{soundbiteId}', soundbiteId);
    endpoint = endpoint.replace('{playlistId}', playlistId);

    const functionName = `${operation}_example`;

    return `def ${functionName}(${this.getFunctionParams(operation, productId, audioId, soundbiteId)}, use_sandbox=True):
    """${opConfig.description}"""

    try:
        # Get API configuration
        base_url = get_api_base_url(use_sandbox)
        endpoint = '${endpoint}'
        url = f"{base_url}{endpoint}"

        ${this.getQueryParamsSection(operation, opConfig)}
        ${this.getRequestBodySection(operation, opConfig)}

        # Create JWT token
        token, body_string = create_jwt_token(request_body, use_sandbox)
        headers = get_api_headers(token)

        ${this.getSpecialHandling(operation, opConfig)}

        ${this.getRequestSection(opConfig.method, opConfig.responseType)}

        ${this.getResponseHandling(operation, opConfig)}

    except requests.exceptions.RequestException as e:
        print(f"Request error: {str(e)}")
        return None
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return None

def validate_audio_format(audio_data):
    """Validate audio format and specifications"""

    supported_formats = ['MP3', 'FLAC', 'WAV', 'AAC']
    format_type = audio_data.get('format', '').upper()

    if format_type not in supported_formats:
        print(f"Warning: Unsupported audio format: {format_type}")
        return False

    duration = audio_data.get('duration', 0)
    if duration <= 0 or duration > 3600:  # Max 1 hour
        print(f"Warning: Invalid audio duration: {duration} seconds")
        return False

    bitrate = audio_data.get('bitrate', 0)
    if bitrate < 64 or bitrate > 1411:  # 64kbps to 1411kbps (FLAC)
        print(f"Warning: Invalid bitrate: {bitrate} kbps")
        return False

    return True

def save_audio_file(audio_data, filename=None):
    """Save streamed audio data to file"""

    if not filename:
        timestamp = int(time.time())
        filename = f"soundbite_{timestamp}.mp3"

    try:
        with open(filename, 'wb') as f:
            for chunk in audio_data.iter_content(chunk_size=8192):
                f.write(chunk)

        print(f"Audio saved as: {filename}")
        return filename
    except Exception as e:
        print(f"Error saving audio: {str(e)}")
        return None

def calculate_audio_price(duration, quality, format_type):
    """Calculate price for audio content based on specifications"""

    base_price = 0.99  # Base price in EUR
    duration_multiplier = max(1, duration / 60)  # Per minute
    quality_multiplier = {'LOW': 0.8, 'MEDIUM': 1.0, 'HIGH': 1.3, 'HIGHEST': 1.6}
    format_multiplier = {'MP3': 1.0, 'FLAC': 1.5, 'WAV': 1.3, 'AAC': 1.1}

    total_price = (base_price *
                  duration_multiplier *
                  quality_multiplier.get(quality, 1.0) *
                  format_multiplier.get(format_type, 1.0))

    return round(total_price, 2)

# Example usage
if __name__ == "__main__":
    print("Soundbites Example")

    # ${opConfig.description}
    result = ${functionName}()

    if result:
        print("Soundbite operation completed successfully")
        ${this.getUsageExample(operation)}
    else:
        print("Soundbite operation failed")`;
  }

  getFunctionParams(operation, productId, audioId, soundbiteId) {
    const params = [];

    if (operation.includes('audio') || operation.includes('register') || operation.includes('list')) {
      params.push(`product_id='${productId}'`);
      if (!operation.includes('list') && !operation.includes('register')) {
        params.push(`audio_id='${audioId}'`);
      }
    } else if (operation.includes('soundbite') || operation.includes('stream') || operation.includes('download')) {
      params.push(`soundbite_id='${soundbiteId}'`);
    }

    return params.join(', ');
  }

  getQueryParamsSection(operation, opConfig) {
    if (!opConfig.queryParams) {
      return '';
    }

    const paramsStr = Object.entries(opConfig.queryParams)
      .map(([key, value]) => `        '${key}': ${typeof value === 'string' ? `'${value}'` : value}`)
      .join(',\n');

    return `# Add query parameters
    params = {
${paramsStr}
    }
    if params:
        url += '?' + '&'.join([f"{k}={v}" for k, v in params.items()])`;
  }

  getRequestBodySection(operation, opConfig) {
    if (!opConfig.sampleBody) {
      return '# No request body needed for this operation\n        request_body = None';
    }

    const bodyStr = JSON.stringify(opConfig.sampleBody, null, 8).replace(/^/gm, '        ');

    let validation = '';
    if (operation === 'register_audio') {
      validation = `
        # Validate audio specifications
        if 'audioData' in request_body:
            if not validate_audio_format(request_body['audioData']):
                print("Warning: Audio validation failed")`;
    }

    return `# Prepare request body
        request_body = ${bodyStr}${validation}`;
  }

  getSpecialHandling(operation, opConfig) {
    if (opConfig.responseType === 'audio' || opConfig.responseType === 'file') {
      return `# Set headers for audio/file response
        headers['Accept'] = 'audio/*' if '${opConfig.responseType}' == 'audio' else 'application/octet-stream'`;
    }
    return '';
  }

  getRequestSection(method, responseType) {
    if (method === 'GET') {
      if (responseType === 'audio' || responseType === 'file') {
        return 'response = requests.get(url, headers=headers, stream=True)';
      }
      return 'response = requests.get(url, headers=headers)';
    } else if (method === 'DELETE') {
      return 'response = requests.delete(url, headers=headers, data=body_string if request_body else None)';
    } else {
      return `response = requests.${method.toLowerCase()}(
            url,
            headers=headers,
            data=body_string if request_body else None
        )`;
    }
  }

  getResponseHandling(operation, opConfig) {
    if (opConfig.responseType === 'audio' || opConfig.responseType === 'file') {
      return `if response.status_code == 200:
            # Handle audio/file download
            content_type = response.headers.get('content-type', '')
            file_extension = 'mp3' if 'audio' in content_type else 'dat'
            filename = f"{operation}_{soundbite_id if 'soundbite' in locals() else audio_id}.{file_extension}"

            saved_file = save_audio_file(response, filename)
            if saved_file:
                print(f"${opConfig.description} successful - file saved: {saved_file}")
                return {'filename': saved_file, 'content_type': content_type}
            else:
                print("Failed to save audio file")
                return None
        else:
            error_msg = f"Request failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None`;
    } else {
      return `if response.status_code == 200:
            result = response.json()
            print(f"${opConfig.description} successful:")
            print(json.dumps(result, indent=2))
            return result
        else:
            error_msg = f"Request failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None`;
    }
  }

  getUsageExample(operation) {
    const examples = {
      register_audio: `# Store audio ID for transactions
        if 'audioId' in result:
            audio_id = result['audioId']
            print(f"Audio registered: {audio_id}")
            print("Use create_soundbite_transaction_example() to enable purchases")`,

      create_soundbite_transaction: `# Monitor transaction and enable access
        if 'transactionId' in result:
            transaction_id = result['transactionId']
            soundbite_id = result.get('soundbiteId')
            print(f"Soundbite transaction: {transaction_id}")
            if soundbite_id:
                print(f"Access with: stream_audio_example('{soundbite_id}')")`,

      stream_audio: `# Audio streaming started
        if 'filename' in result:
            print(f"Audio streamed and saved: {result['filename']}")
            print("Playback can begin immediately")`,

      get_soundbite_analytics: `# Display analytics insights
        analytics = result.get('analytics', {})
        period = result.get('period')

        print(f"Soundbite Analytics for {period}:")
        for metric, data in analytics.items():
            if isinstance(data, dict):
                print(f"- {metric}:")
                for key, value in data.items():
                    print(f"  - {key}: {value}")
            else:
                print(f"- {metric}: {data}")

        # Calculate revenue per stream
        if 'purchases' in analytics and 'revenue' in analytics:
            purchases = analytics['purchases']
            revenue = analytics['revenue']
            if purchases > 0:
                avg_revenue = revenue / purchases
                print(f"\\nAverage revenue per purchase: €{avg_revenue:.2f}")`
    };

    return examples[operation] || '# Process soundbite result as needed';
  }
}

/**
 * Node.js Soundbites Generator
 */
export class NodeJSSoundbitesGenerator extends ExampleGenerator {
  constructor() {
    super('nodejs');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = SoundbiteOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const {
      productId = 'pr_audio_123',
      audioId = 'aud_content_456',
      soundbiteId = 'sb_transaction_789',
      playlistId = 'pl_collection_012',
      ...otherParams
    } = params;

    let endpoint = opConfig.endpoint;
    endpoint = endpoint.replace('{id}', productId);
    endpoint = endpoint.replace('{audioId}', audioId);
    endpoint = endpoint.replace('{soundbiteId}', soundbiteId);
    endpoint = endpoint.replace('{playlistId}', playlistId);

    const functionName = `${operation}Example`;

    return `async function ${functionName}(${this.getFunctionParams(operation, productId, audioId, soundbiteId)}, useSandbox = true) {
  /**
   * ${opConfig.description}
   */

  try {
    // Get API configuration
    const baseUrl = getAPIBaseURL(useSandbox);
    const endpoint = '${endpoint}';
    let url = \`\${baseUrl}\${endpoint}\`;

    ${this.getQueryParamsSection(operation, opConfig)}
    ${this.getRequestBodySection(operation, opConfig)}

    // Create JWT token
    const { token, bodyString } = createJWTToken(requestBody, useSandbox);
    const headers = getAPIHeaders(token);

    ${this.getSpecialHandling(operation, opConfig)}

    ${this.getRequestSection(opConfig.method, opConfig.responseType)}

    ${this.getResponseHandling(operation, opConfig)}

  } catch (error) {
    if (error.response) {
      console.error(\`API Error: \${error.response.status} - \${error.response.data}\`);
    } else {
      console.error('Request Error:', error.message);
    }
    return null;
  }
}

function validateAudioFormat(audioData) {
  /**
   * Validate audio format and specifications
   */

  const supportedFormats = ['MP3', 'FLAC', 'WAV', 'AAC'];
  const formatType = (audioData.format || '').toUpperCase();

  if (!supportedFormats.includes(formatType)) {
    console.warn(\`Warning: Unsupported audio format: \${formatType}\`);
    return false;
  }

  const duration = audioData.duration || 0;
  if (duration <= 0 || duration > 3600) { // Max 1 hour
    console.warn(\`Warning: Invalid audio duration: \${duration} seconds\`);
    return false;
  }

  const bitrate = audioData.bitrate || 0;
  if (bitrate < 64 || bitrate > 1411) { // 64kbps to 1411kbps (FLAC)
    console.warn(\`Warning: Invalid bitrate: \${bitrate} kbps\`);
    return false;
  }

  return true;
}

function saveAudioFile(audioData, filename) {
  /**
   * Save streamed audio data to file
   */
  const fs = require('fs');

  if (!filename) {
    const timestamp = Date.now();
    filename = \`soundbite_\${timestamp}.mp3\`;
  }

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filename);
    audioData.pipe(writer);

    writer.on('finish', () => {
      console.log(\`Audio saved as: \${filename}\`);
      resolve(filename);
    });

    writer.on('error', (error) => {
      console.error(\`Error saving audio: \${error.message}\`);
      reject(error);
    });
  });
}

function calculateAudioPrice(duration, quality, formatType) {
  /**
   * Calculate price for audio content based on specifications
   */

  const basePrice = 0.99; // Base price in EUR
  const durationMultiplier = Math.max(1, duration / 60); // Per minute
  const qualityMultiplier = { 'LOW': 0.8, 'MEDIUM': 1.0, 'HIGH': 1.3, 'HIGHEST': 1.6 };
  const formatMultiplier = { 'MP3': 1.0, 'FLAC': 1.5, 'WAV': 1.3, 'AAC': 1.1 };

  const totalPrice = basePrice *
                    durationMultiplier *
                    (qualityMultiplier[quality] || 1.0) *
                    (formatMultiplier[formatType] || 1.0);

  return Math.round(totalPrice * 100) / 100; // Round to 2 decimal places
}

// Example usage
async function main() {
  console.log('Soundbites Example');

  try {
    const result = await ${functionName}();

    if (result) {
      console.log('Soundbite operation completed successfully');
      ${this.getUsageExample(operation)}
    } else {
      console.log('Soundbite operation failed');
    }

  } catch (error) {
    console.error('Soundbite operation error:', error.message);
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}`;
  }

  getFunctionParams(operation, productId, audioId, soundbiteId) {
    const params = [];

    if (operation.includes('audio') || operation.includes('register') || operation.includes('list')) {
      params.push(`productId = '${productId}'`);
      if (!operation.includes('list') && !operation.includes('register')) {
        params.push(`audioId = '${audioId}'`);
      }
    } else if (operation.includes('soundbite') || operation.includes('stream') || operation.includes('download')) {
      params.push(`soundbiteId = '${soundbiteId}'`);
    }

    return params.join(', ');
  }

  getQueryParamsSection(operation, opConfig) {
    if (!opConfig.queryParams) {
      return '';
    }

    const paramsStr = JSON.stringify(opConfig.queryParams, null, 4).replace(/^/gm, '    ');
    return `// Add query parameters
    const queryParams = ${paramsStr};
    const searchParams = new URLSearchParams(queryParams);
    url += \`?\${searchParams.toString()}\`;`;
  }

  getRequestBodySection(operation, opConfig) {
    if (!opConfig.sampleBody) {
      return '// No request body needed for this operation\n    const requestBody = null;';
    }

    const bodyStr = JSON.stringify(opConfig.sampleBody, null, 4).replace(/^/gm, '    ');

    let validation = '';
    if (operation === 'register_audio') {
      validation = `

    // Validate audio specifications
    if (requestBody.audioData) {
      if (!validateAudioFormat(requestBody.audioData)) {
        console.warn('Warning: Audio validation failed');
      }
    }`;
    }

    return `// Prepare request body
    const requestBody = ${bodyStr};${validation}`;
  }

  getSpecialHandling(operation, opConfig) {
    if (opConfig.responseType === 'audio' || opConfig.responseType === 'file') {
      return `// Set headers for audio/file response
    headers['Accept'] = '${opConfig.responseType}' === 'audio' ? 'audio/*' : 'application/octet-stream';`;
    }
    return '';
  }

  getRequestSection(method, responseType) {
    if (method === 'GET') {
      if (responseType === 'audio' || responseType === 'file') {
        return `const response = await axios.get(url, {
      headers,
      responseType: 'stream'
    });`;
      }
      return 'const response = await axios.get(url, { headers });';
    } else if (method === 'DELETE') {
      return `const response = await axios.delete(url, {
      headers,
      data: bodyString || undefined
    });`;
    } else {
      return `const response = await axios.${method.toLowerCase()}(
      url,
      bodyString || undefined,
      { headers }
    );`;
    }
  }

  getResponseHandling(operation, opConfig) {
    if (opConfig.responseType === 'audio' || opConfig.responseType === 'file') {
      return `if (response.status === 200) {
      // Handle audio/file download
      const contentType = response.headers['content-type'] || '';
      const fileExtension = contentType.includes('audio') ? 'mp3' : 'dat';
      const filename = \`\${operation}_\${soundbiteId || audioId}.\${fileExtension}\`;

      try {
        const savedFile = await saveAudioFile(response.data, filename);
        console.log(\`${opConfig.description} successful - file saved: \${savedFile}\`);
        return { filename: savedFile, contentType };
      } catch (error) {
        console.error('Failed to save audio file:', error.message);
        return null;
      }
    } else {
      console.error(\`Request failed with status \${response.status}: \${response.statusText}\`);
      return null;
    }`;
    } else {
      return `if (response.status === 200) {
      const result = response.data;
      console.log('${opConfig.description} successful:');
      console.log(JSON.stringify(result, null, 2));
      return result;
    } else {
      console.error(\`Request failed with status \${response.status}: \${response.statusText}\`);
      return null;
    }`;
    }
  }

  getUsageExample(operation) {
    const examples = {
      register_audio: `// Store audio ID for transactions
    if (result.audioId) {
      const audioId = result.audioId;
      console.log(\`Audio registered: \${audioId}\`);
      console.log('Use createSoundbiteTransactionExample() to enable purchases');
    }`,

      create_soundbite_transaction: `// Monitor transaction and enable access
    if (result.transactionId) {
      const transactionId = result.transactionId;
      const soundbiteId = result.soundbiteId;
      console.log(\`Soundbite transaction: \${transactionId}\`);
      if (soundbiteId) {
        console.log(\`Access with: streamAudioExample('\${soundbiteId}')\`);
      }
    }`,

      stream_audio: `// Audio streaming started
    if (result.filename) {
      console.log(\`Audio streamed and saved: \${result.filename}\`);
      console.log('Playback can begin immediately');
    }`,

      get_soundbite_analytics: `// Display analytics insights
    const analytics = result.analytics || {};
    const period = result.period;

    console.log(\`Soundbite Analytics for \${period}:\`);
    Object.entries(analytics).forEach(([metric, data]) => {
      if (typeof data === 'object' && data !== null) {
        console.log(\`- \${metric}:\`);
        Object.entries(data).forEach(([key, value]) => {
          console.log(\`  - \${key}: \${value}\`);
        });
      } else {
        console.log(\`- \${metric}: \${data}\`);
      }
    });

    // Calculate revenue per stream
    if (analytics.purchases && analytics.revenue) {
      const purchases = analytics.purchases;
      const revenue = analytics.revenue;
      if (purchases > 0) {
        const avgRevenue = revenue / purchases;
        console.log(\`\\nAverage revenue per purchase: €\${avgRevenue.toFixed(2)}\`);
      }
    }`
    };

    return examples[operation] || '// Process soundbite result as needed';
  }
}

/**
 * Export all generators
 */
export const SoundbitesGenerators = {
  python: PythonSoundbitesGenerator,
  nodejs: NodeJSSoundbitesGenerator,
  javascript: NodeJSSoundbitesGenerator
};

/**
 * Generate soundbites example
 */
export function generateSoundbitesExample(operation, language = 'python', partnerType = 'merchant', options = {}) {
  const GeneratorClass = SoundbitesGenerators[language];
  if (!GeneratorClass) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const generator = new GeneratorClass();
  return generator.generateExample(operation, partnerType, options);
}