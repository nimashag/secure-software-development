import express from 'express';
import {
  registerUser,
  loginUser,
  getMyProfile,
  getAllUsers,
  updateUserById,
  deleteUserById,
  getUserById,
  loginWithGoogle,            // <= add this
} from '../controllers/users.authcontroller';
import { authenticate } from '../middleware/authMiddleware'; // if your filename is auth.middleware.ts, keep import path consistent!
import { isAppAdmin } from '../middleware/role.middleware';

const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', loginWithGoogle);     // <= Google login endpoint

// Protected route
router.get('/me', authenticate, getMyProfile);

// Admin-only routes (requires appAdmin role)
router.get('/all', authenticate, isAppAdmin, getAllUsers);
router.put('/:id', authenticate, isAppAdmin, updateUserById);
router.get('/:id', getUserById);
router.delete('/:id', authenticate, isAppAdmin, deleteUserById);

export default router;