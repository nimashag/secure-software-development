import { Request, Response } from 'express';
import UserModel, { IUser } from '../models/users.model';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET not set in environment");
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.warn("GOOGLE_CLIENT_ID not set in environment (required for Google login)");
}
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// REGISTER
export const registerUser = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      password,
      role,
      phone,
      address,
    } = req.body;

    console.log('Register request received with data:', req.body);

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const newUser = new UserModel({
      name,
      email,
      password,  // password is required here for manual registration
      role,
      phone,
      address,
    });

    await newUser.save();
    console.log('New user registered with ID:', newUser._id.toString());
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed', error: err });
  }
};

// LOGIN (email/password)
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await UserModel.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('User logged in with ID:', user._id.toString());

    const response = {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved
      }
    };

    console.log(`Response: ${JSON.stringify(response)}`);
    res.json(response);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed', error: err });
  }
};

// GOOGLE LOGIN
// POST /api/auth/google   { credential: <google_id_token>, role?: 'customer' | ... }
export const loginWithGoogle = async (req: Request, res: Response) => {
  try {
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      return res.status(500).json({ message: 'Google login is not configured on server' });
    }

    const { credential, role } = req.body; // role is optional, defaults to 'customer'
    if (!credential) return res.status(400).json({ message: 'Missing Google credential' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split('@')[0];

    // Find by googleId or by email (to link existing local account)
    let user = await UserModel.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      user = new UserModel({
        name,
        email,
        googleId,
        role: role || 'customer', // default role for Google signup
        // no password for Google-only account
        isApproved: true,         // or your own business rule
      });
      await user.save();
    } else if (!user.googleId) {
      // Link Google to existing account
      user.googleId = googleId;
      // ensure required fields are set (role may already exist)
      if (!user.role) user.role = role || 'customer';
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
      },
    });
  } catch (err) {
    console.error('Google login error:', err);
    return res.status(500).json({ message: 'Google login failed' });
  }
};

// GET ALL USERS – Admin Only
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await UserModel.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users', error: err });
  }
};

// GET CURRENT USER /me
export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const user = await UserModel.findById(userId).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error('Get /me error:', err);
    res.status(500).json({ message: 'Failed to fetch user', error: err });
  }
};

// UPDATE USER BY ID – Admin Only
export const updateUserById = async (req: Request, res: Response) => {
  try {
    const updatedUser = await UserModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).select('-password');

    if (!updatedUser) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user', error: err });
  }
};

// DELETE USER BY ID – Admin Only
export const deleteUserById = async (req: Request, res: Response) => {
  try {
    const deletedUser = await UserModel.findByIdAndDelete(req.params.id);
    if (!deletedUser) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete user', error: err });
  }
};

// Fetch user by ID
export const getUserById = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const user = await UserModel.findById(userId); // ensure not 'User' typo

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ message: 'Error fetching user data' });
  }
};
