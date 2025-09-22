import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcrypt';

export type UserRole = 'customer' | 'restaurantAdmin' | 'deliveryPersonnel' | 'appAdmin';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;          // <= optional now (Google-only users won't have it)
  role: UserRole;
  isApproved: boolean;
  phone?: string;
  address?: string;
  googleId?: string;          // <= add this

  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // Conditionally required: if a user doesn't have googleId, password is required
    password: {
      type: String,
      required: function (this: IUser) {
        return !this.googleId;
      },
    },
    role: {
      type: String,
      enum: ['customer', 'restaurantAdmin', 'deliveryPersonnel', 'appAdmin'],
      required: true,
    },
    isApproved: { type: Boolean, default: false },

    phone: { type: String },
    address: { type: String },

    googleId: { type: String, index: true },  // <= index for quick lookups
  },
  { timestamps: true }
);

// Password hashing (only if password exists & is modified)
userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare passwords (return false if no local password—e.g., Google-only account)
userSchema.methods.comparePassword = async function (
  this: IUser,
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default model<IUser>('User', userSchema);
