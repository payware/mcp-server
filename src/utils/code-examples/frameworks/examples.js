/**
 * Framework-specific integration examples
 */

import { ExampleGenerator } from '../common/helpers.js';

/**
 * Django REST Framework integration
 */
export const DjangoExamples = {
  /**
   * Django view for transaction creation
   */
  transactionView: `
# views.py - Django REST Framework implementation
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
import logging

from .payware_client import PaywareClient
from .serializers import TransactionSerializer

logger = logging.getLogger(__name__)

class PaywareTransactionView(APIView):
    """
    Handle payware transaction operations
    """

    def __init__(self):
        super().__init__()
        self.payware_client = PaywareClient(
            partner_id=settings.PAYWARE_PARTNER_ID,
            private_key_path=settings.PAYWARE_PRIVATE_KEY_PATH,
            use_sandbox=settings.PAYWARE_USE_SANDBOX
        )

    def post(self, request):
        """Create a new transaction"""
        serializer = TransactionSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Prepare transaction data
            transaction_data = {
                'trData': {
                    'amount': serializer.validated_data['amount'],
                    'currency': serializer.validated_data.get('currency', 'EUR'),
                    'reasonL1': serializer.validated_data['description']
                },
                'trOptions': {
                    'type': 'PLAIN',
                    'timeToLive': 120
                }
            }

            # Create transaction via payware API
            result = self.payware_client.create_transaction(transaction_data)

            if result:
                # Log successful transaction creation
                logger.info(f"Transaction created: {result.get('transactionId')}")

                return Response({
                    'success': True,
                    'transaction_id': result.get('transactionId'),
                    'amount': result.get('amount'),
                    'status': result.get('status'),
                    'payment_url': result.get('paymentUrl')
                }, status=status.HTTP_201_CREATED)
            else:
                logger.error("Failed to create transaction")
                return Response({
                    'success': False,
                    'error': 'Transaction creation failed'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            logger.error(f"Transaction creation error: {str(e)}")
            return Response({
                'success': False,
                'error': 'Internal server error'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def get(self, request, transaction_id=None):
        """Get transaction status"""
        if not transaction_id:
            return Response({
                'error': 'Transaction ID required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = self.payware_client.get_transaction_status(transaction_id)

            if result:
                return Response({
                    'success': True,
                    'transaction_id': transaction_id,
                    'status': result.get('status'),
                    'amount': result.get('amount'),
                    'currency': result.get('currency'),
                    'created_at': result.get('createdAt'),
                    'updated_at': result.get('updatedAt')
                })
            else:
                return Response({
                    'error': 'Transaction not found'
                }, status=status.HTTP_404_NOT_FOUND)

        except Exception as e:
            logger.error(f"Get transaction error: {str(e)}")
            return Response({
                'error': 'Internal server error'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
`,

  /**
   * Django settings configuration
   */
  settings: `
# settings.py - Django configuration for payware
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# payware Configuration
PAYWARE_PARTNER_ID = os.getenv('PAYWARE_PARTNER_ID')
PAYWARE_PRIVATE_KEY_PATH = os.path.join(BASE_DIR, 'keys', 'sandbox-merchant-private-key.pem')
PAYWARE_USE_SANDBOX = os.getenv('PAYWARE_USE_SANDBOX', 'true').lower() == 'true'
PAYWARE_SANDBOX_URL = 'https://sandbox.payware.eu/api'
PAYWARE_PRODUCTION_URL = 'https://api.payware.eu/api'

# Logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': 'payware.log',
        },
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'payware': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}
`,

  /**
   * Django URL patterns
   */
  urls: `
# urls.py - Django URL configuration
from django.urls import path
from .views import PaywareTransactionView

urlpatterns = [
    path('api/transactions/', PaywareTransactionView.as_view(), name='create_transaction'),
    path('api/transactions/<str:transaction_id>/', PaywareTransactionView.as_view(), name='get_transaction'),
]
`
};

/**
 * Express.js integration
 */
export const ExpressExamples = {
  /**
   * Express.js routes for payware integration
   */
  routes: `
// routes/payware.js - Express.js implementation
const express = require('express');
const router = express.Router();
const PaywareClient = require('../lib/payware-client');
const { body, param, validationResult } = require('express-validator');

// Initialize payware client
const paywareClient = new PaywareClient({
    partnerId: process.env.PAYWARE_PARTNER_ID,
    privateKeyPath: process.env.PAYWARE_PRIVATE_KEY_PATH,
    useSandbox: process.env.PAYWARE_USE_SANDBOX === 'true'
});

/**
 * Create transaction
 */
router.post('/transactions',
    // Validation middleware
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('currency').optional().isIn(['EUR', 'USD', 'GBP']).withMessage('Invalid currency'),
    body('description').isLength({ min: 1, max: 255 }).withMessage('Description required'),

    async (req, res) => {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        try {
            const { amount, currency = 'EUR', description } = req.body;

            // Prepare transaction data
            const transactionData = {
                trData: {
                    amount: amount.toString(),
                    currency,
                    reasonL1: description
                },
                trOptions: {
                    type: 'PLAIN',
                    timeToLive: 120
                }
            };

            // Create transaction
            const result = await paywareClient.createTransaction(transactionData);

            if (result) {
                console.log(\`Transaction created: \${result.transactionId}\`);

                res.status(201).json({
                    success: true,
                    transactionId: result.transactionId,
                    amount: result.amount,
                    status: result.status,
                    paymentUrl: result.paymentUrl
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Transaction creation failed'
                });
            }

        } catch (error) {
            console.error('Transaction creation error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
);

/**
 * Get transaction status
 */
router.get('/transactions/:transactionId',
    param('transactionId').isLength({ min: 1 }).withMessage('Transaction ID required'),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        try {
            const { transactionId } = req.params;
            const result = await paywareClient.getTransactionStatus(transactionId);

            if (result) {
                res.json({
                    success: true,
                    transactionId,
                    status: result.status,
                    amount: result.amount,
                    currency: result.currency,
                    createdAt: result.createdAt,
                    updatedAt: result.updatedAt
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }

        } catch (error) {
            console.error('Get transaction error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
);

/**
 * Process transaction (merchant)
 */
router.post('/transactions/:transactionId/process',
    param('transactionId').isLength({ min: 1 }).withMessage('Transaction ID required'),
    body('account').isLength({ min: 1 }).withMessage('Account required'),
    body('friendlyName').isLength({ min: 1 }).withMessage('Friendly name required'),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        try {
            const { transactionId } = req.params;
            const { account, friendlyName } = req.body;

            const processData = {
                account,
                friendlyName
            };

            const result = await paywareClient.processTransaction(transactionId, processData);

            if (result) {
                res.json({
                    success: true,
                    transactionId,
                    status: result.status,
                    processedAt: result.processedAt
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Transaction processing failed'
                });
            }

        } catch (error) {
            console.error('Process transaction error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
);

module.exports = router;
`,

  /**
   * Express.js middleware
   */
  middleware: `
// middleware/payware-auth.js - Express.js authentication middleware
const PaywareAuthenticator = require('../lib/payware-authenticator');

/**
 * Middleware to authenticate payware API requests
 */
function paywareAuthMiddleware(req, res, next) {
    try {
        // Initialize authenticator if not already done
        if (!req.paywareAuth) {
            req.paywareAuth = new PaywareAuthenticator({
                partnerId: process.env.PAYWARE_PARTNER_ID,
                privateKeyPath: process.env.PAYWARE_PRIVATE_KEY_PATH,
                useSandbox: process.env.PAYWARE_USE_SANDBOX === 'true'
            });
        }

        next();
    } catch (error) {
        console.error('payware authentication setup error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication setup failed'
        });
    }
}

/**
 * Middleware to log payware API requests
 */
function paywareLoggingMiddleware(req, res, next) {
    const start = Date.now();

    // Log request
    console.log(\`[payware] \${req.method} \${req.path} - Request started\`);

    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(body) {
        const duration = Date.now() - start;
        console.log(\`[payware] \${req.method} \${req.path} - \${res.statusCode} (\${duration}ms)\`);

        if (res.statusCode >= 400) {
            console.error(\`[payware] Error response:\`, body);
        }

        return originalJson.call(this, body);
    };

    next();
}

module.exports = {
    paywareAuthMiddleware,
    paywareLoggingMiddleware
};
`,

  /**
   * Express.js app setup
   */
  app: `
// app.js - Express.js application setup
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes and middleware
const paywareRoutes = require('./routes/payware');
const { paywareAuthMiddleware, paywareLoggingMiddleware } = require('./middleware/payware-auth');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// payware-specific middleware
app.use('/api/payware', paywareLoggingMiddleware);
app.use('/api/payware', paywareAuthMiddleware);

// Routes
app.use('/api/payware', paywareRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        payware: {
            configured: !!(process.env.PAYWARE_PARTNER_ID && process.env.PAYWARE_PRIVATE_KEY_PATH),
            sandbox: process.env.PAYWARE_USE_SANDBOX === 'true'
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Application error:', error);

    res.status(error.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
    console.log(\`payware sandbox mode: \${process.env.PAYWARE_USE_SANDBOX === 'true'}\`);
});

module.exports = app;
`
};

/**
 * Laravel integration
 */
export const LaravelExamples = {
  /**
   * Laravel controller for payware
   */
  controller: `
<?php
// app/Http/Controllers/PaywareController.php - Laravel implementation

namespace App\\Http\\Controllers;

use Illuminate\\Http\\Request;
use Illuminate\\Http\\Response;
use Illuminate\\Support\\Facades\\Log;
use Illuminate\\Support\\Facades\\Validator;
use App\\Services\\PaywareService;
use App\\Http\\Requests\\CreateTransactionRequest;

class PaywareController extends Controller
{
    protected $paywareService;

    public function __construct(PaywareService $paywareService)
    {
        $this->paywareService = $paywareService;
    }

    /**
     * Create a new transaction
     */
    public function createTransaction(CreateTransactionRequest $request)
    {
        try {
            $validated = $request->validated();

            $transactionData = [
                'trData' => [
                    'amount' => $validated['amount'],
                    'currency' => $validated['currency'] ?? 'EUR',
                    'reasonL1' => $validated['description']
                ],
                'trOptions' => [
                    'type' => 'PLAIN',
                    'timeToLive' => 120
                ]
            ];

            $result = $this->paywareService->createTransaction($transactionData);

            if ($result) {
                Log::info('Transaction created', ['transaction_id' => $result['transactionId']]);

                return response()->json([
                    'success' => true,
                    'transaction_id' => $result['transactionId'],
                    'amount' => $result['amount'],
                    'status' => $result['status'],
                    'payment_url' => $result['paymentUrl']
                ], Response::HTTP_CREATED);
            }

            return response()->json([
                'success' => false,
                'error' => 'Transaction creation failed'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);

        } catch (\\Exception $e) {
            Log::error('Transaction creation error', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'error' => 'Internal server error'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get transaction status
     */
    public function getTransactionStatus(string $transactionId)
    {
        try {
            $result = $this->paywareService->getTransactionStatus($transactionId);

            if ($result) {
                return response()->json([
                    'success' => true,
                    'transaction_id' => $transactionId,
                    'status' => $result['status'],
                    'amount' => $result['amount'],
                    'currency' => $result['currency'],
                    'created_at' => $result['createdAt'],
                    'updated_at' => $result['updatedAt']
                ]);
            }

            return response()->json([
                'success' => false,
                'error' => 'Transaction not found'
            ], Response::HTTP_NOT_FOUND);

        } catch (\\Exception $e) {
            Log::error('Get transaction error', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'error' => 'Internal server error'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Process transaction
     */
    public function processTransaction(Request $request, string $transactionId)
    {
        $validator = Validator::make($request->all(), [
            'account' => 'required|string|max:255',
            'friendly_name' => 'required|string|max:255'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], Response::HTTP_BAD_REQUEST);
        }

        try {
            $processData = [
                'account' => $request->account,
                'friendlyName' => $request->friendly_name
            ];

            $result = $this->paywareService->processTransaction($transactionId, $processData);

            if ($result) {
                return response()->json([
                    'success' => true,
                    'transaction_id' => $transactionId,
                    'status' => $result['status'],
                    'processed_at' => $result['processedAt']
                ]);
            }

            return response()->json([
                'success' => false,
                'error' => 'Transaction processing failed'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);

        } catch (\\Exception $e) {
            Log::error('Process transaction error', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'error' => 'Internal server error'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }
}
`,

  /**
   * Laravel service class
   */
  service: `
<?php
// app/Services/PaywareService.php - Laravel service for payware integration

namespace App\\Services;

use Illuminate\\Support\\Facades\\Http;
use Illuminate\\Support\\Facades\\Log;
use Illuminate\\Support\\Facades\\Cache;
use App\\Exceptions\\PaywareException;

class PaywareService
{
    protected $partnerId;
    protected $privateKeyPath;
    protected $useSandbox;
    protected $baseUrl;

    public function __construct()
    {
        $this->partnerId = config('services.payware.partner_id');
        $this->privateKeyPath = config('services.payware.private_key_path');
        $this->useSandbox = config('services.payware.use_sandbox', true);
        $this->baseUrl = $this->useSandbox
            ? config('services.payware.sandbox_url')
            : config('services.payware.production_url');
    }

    /**
     * Create JWT token for API authentication
     */
    protected function createJWTToken($requestBody = null)
    {
        // Load private key
        $privateKey = file_get_contents($this->privateKeyPath);
        if (!$privateKey) {
            throw new PaywareException('Unable to load private key');
        }

        // Create JWT header
        $header = [
            'alg' => 'RS256',
            'typ' => 'JWT'
        ];

        // Add content SHA-256 for requests with body
        $bodyString = null;
        if ($requestBody) {
            $bodyString = $this->createMinimizedJSON($requestBody);
            $contentSha256 = base64_encode(hash('sha256', $bodyString, true));
            $header['contentSha256'] = $contentSha256;
        }

        // Create JWT payload
        $payload = [
            'iss' => $this->partnerId,
            'aud' => 'https://payware.eu',
            'iat' => time()
        ];

        // Create JWT token
        $token = \\Firebase\\JWT\\JWT::encode($payload, $privateKey, 'RS256', null, $header);

        return [
            'token' => $token,
            'bodyString' => $bodyString
        ];
    }

    /**
     * Create minimized JSON for deterministic SHA-256
     */
    protected function createMinimizedJSON($data)
    {
        if (is_array($data)) {
            ksort($data);
            foreach ($data as $key => $value) {
                $data[$key] = $this->createMinimizedJSON($value);
            }
        }

        return json_encode($data, JSON_UNESCAPED_SLASHES);
    }

    /**
     * Make authenticated API request
     */
    protected function makeAPIRequest($endpoint, $method = 'GET', $requestBody = null)
    {
        $tokenData = $this->createJWTToken($requestBody);

        $headers = [
            'Authorization' => 'Bearer ' . $tokenData['token'],
            'Content-Type' => 'application/json',
            'Api-Version' => '1'
        ];

        $url = $this->baseUrl . $endpoint;

        $response = Http::withHeaders($headers)
            ->timeout(30)
            ->{strtolower($method)}($url, $requestBody ? json_decode($tokenData['bodyString'], true) : []);

        if ($response->successful()) {
            return $response->json();
        }

        Log::error('payware API request failed', [
            'endpoint' => $endpoint,
            'method' => $method,
            'status' => $response->status(),
            'response' => $response->body()
        ]);

        return null;
    }

    /**
     * Create transaction
     */
    public function createTransaction(array $transactionData)
    {
        return $this->makeAPIRequest('/transactions', 'POST', $transactionData);
    }

    /**
     * Get transaction status
     */
    public function getTransactionStatus(string $transactionId)
    {
        return $this->makeAPIRequest("/transactions/{$transactionId}");
    }

    /**
     * Process transaction
     */
    public function processTransaction(string $transactionId, array $processData)
    {
        return $this->makeAPIRequest("/transactions/{$transactionId}", 'POST', $processData);
    }

    /**
     * Cancel transaction
     */
    public function cancelTransaction(string $transactionId, array $cancelData)
    {
        return $this->makeAPIRequest("/transactions/{$transactionId}", 'PATCH', $cancelData);
    }
}
`,

  /**
   * Laravel configuration
   */
  config: `
<?php
// config/services.php - Laravel services configuration

return [
    // ... other services

    'payware' => [
        'partner_id' => env('PAYWARE_PARTNER_ID'),
        'private_key_path' => env('PAYWARE_PRIVATE_KEY_PATH'),
        'use_sandbox' => env('PAYWARE_USE_SANDBOX', true),
        'sandbox_url' => env('PAYWARE_SANDBOX_URL', 'https://sandbox.payware.eu/api'),
        'production_url' => env('PAYWARE_PRODUCTION_URL', 'https://api.payware.eu/api'),
    ],
];
`
};

/**
 * Export all framework examples
 */
export const FrameworkExamples = {
  django: DjangoExamples,
  express: ExpressExamples,
  laravel: LaravelExamples
};