import express from 'express';
import expertController from '../controllers/expertController.js';
import { auth } from '../middleware/auth.js';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const router = express.Router();

/**
 * @swagger
 * /api/experts:
 * get:
 * summary: Get filtered list of experts
 * tags:
 * - Experts
 * parameters:
 * - in: query
 * name: domain
 * schema:
 * type: string
 * description: Single domain (e.g. ai)
 * - in: query
 * name: query
 * schema:
 * type: string
 * description: Search by name or bio
 * - in: query
 * name: rateMin
 * schema:
 * type: integer
 * description: Minimum average daily rate
 * - in: query
 * name: rateMax
 * schema:
 * type: integer
 * description: Maximum average daily rate
 * - in: query
 * name: onlyVerified
 * schema:
 * type: boolean
 * description: Set to true to see only vetted experts
 * responses:
 * 200:
 * description: List of experts
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * data:
 * type: array
 * items:
 * type: object
 * properties:
 * id:
 * type: string
 * name:
 * type: string
 * avg_daily_rate:
 * type: number
 * avg_fixed_rate:
 * type: number
 * avg_sprint_rate:
 * type: number
 */
router.get('/', expertController.searchExperts);

/**
 * @swagger
 * /api/experts/semantic-search:
 * post:
 * summary: Semantic search for experts using AI
 * tags:
 * - Experts
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - query
 * properties:
 * query:
 * type: string
 * description: Natural language search query
 * limit:
 * type: integer
 * default: 10
 * description: Maximum number of results
 * responses:
 * 200:
 * description: AI-powered search results
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * results:
 * type: array
 * items:
 * type: object
 * properties:
 * id:
 * type: string
 * name:
 * type: string
 * bio:
 * type: string
 * similarity:
 * type: number
 * query:
 * type: string
 * totalResults:
 * type: integer
 * 500:
 * description: Search service unavailable
 */
router.post('/semantic-search', expertController.semanticSearch);

// routes/experts.js
router.get(
  '/resume/signed-url',
  auth,
  expertController.getResumeSignedUrl
);

router.post('/documents', auth, upload.single('file'), expertController.uploadExpertDocument);

router.delete('/documents/:documentId', auth, expertController.deleteExpertDocument);

router.post(
  '/avatar',
  auth,
  upload.single('file'),
  expertController.uploadAvatar
);

/**
 * @swagger
 * /api/experts/{id}:
 * get:
 * summary: Get single expert profile
 * tags:
 * - Experts
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The expert UUID
 * responses:
 * 200:
 * description: Expert profile details
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * data:
 * type: object
 * properties:
 * id:
 * type: string
 * name:
 * type: string
 * avg_daily_rate:
 * type: number
 * 404:
 * description: Expert not found
 */
router.get('/:id', expertController.getExpertById);

/**
 * @swagger
 * /api/experts/{id}:
 * patch:
 * summary: Update expert profile
 * tags:
 * - Experts
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * experience_summary:
 * type: string
 * avg_daily_rate:
 * type: number
 * domains:
 * type: array
 * items:
 * type: string
 * responses:
 * 200:
 * description: Profile updated successfully
 * 403:
 * description: Unauthorized
 */
router.patch('/:id', auth, expertController.updateExpertProfile);

export default router;