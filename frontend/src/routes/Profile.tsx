/**
 * Profile page - User account management
 * Allows editing display name, uploading avatar, and managing security settings
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, formatDistanceToNow } from 'date-fns';
import { Camera, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PasswordChange } from '@/components/auth/PasswordChange';
import { TOTPSetup } from '@/components/auth/TOTPSetup';
import { useAuth, useChangePassword, useSetupTOTP, useVerifyTOTPSetup } from '@/features/auth/hooks';
import { useUpdateProfile, useUploadAvatar } from '@/features/profile/hooks';

const profileSchema = z.object({
  displayName: z.string().max(50, 'Display name must be 50 characters or less').optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function Profile() {
  const { user, refetch } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [totpDialogOpen, setTotpDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [totpQrCode, setTotpQrCode] = useState<string | undefined>(undefined);
  const [showTotpWarning, setShowTotpWarning] = useState(true);

  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const changePassword = useChangePassword();
  const setupTOTP = useSetupTOTP();
  const verifyTOTPSetup = useVerifyTOTPSetup();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user?.displayName || '',
    },
  });

  // Get initials for avatar fallback
  const getInitials = () => {
    if (user?.displayName) {
      const words = user.displayName.trim().split(/\s+/);
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return words[0][0].toUpperCase();
    }
    return user?.username?.[0]?.toUpperCase() || 'U';
  };

  const handleEditToggle = () => {
    if (isEditing) {
      reset({ displayName: user?.displayName || '' });
    }
    setIsEditing(!isEditing);
  };

  const onProfileSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfile.mutateAsync(data);
      toast.success('Profile updated');
      setIsEditing(false);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, or GIF image');
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      await uploadAvatar.mutateAsync(formData);
      toast.success('Avatar uploaded');
      refetch();
    } catch (error) {
      // Error toast already handled by hook
    }

    // Reset input
    e.target.value = '';
  };

  const handlePasswordChange = async (newPassword: string) => {
    if (!currentPassword) {
      toast.error('Current password is required');
      return;
    }

    try {
      await changePassword.mutateAsync({ newPassword, currentPassword });
      toast.success('Password changed successfully');
      setPasswordDialogOpen(false);
      setCurrentPassword('');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change password');
    }
  };

  const handleTotpRegenerate = async () => {
    try {
      const response = await setupTOTP.mutateAsync();
      setTotpQrCode(response.qrCodeDataURL);
      setShowTotpWarning(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate TOTP');
    }
  };

  const handleTotpVerify = async (code: string) => {
    try {
      await verifyTOTPSetup.mutateAsync(code);
      toast.success('Two-factor authentication regenerated');
      setTotpDialogOpen(false);
      setTotpQrCode(undefined);
      setShowTotpWarning(true);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid code');
    }
  };

  const handlePasswordDialogClose = () => {
    setPasswordDialogOpen(false);
    setCurrentPassword('');
  };

  const handleTotpDialogClose = () => {
    setTotpDialogOpen(false);
    setTotpQrCode(undefined);
    setShowTotpWarning(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Account Info Section */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Your profile details and account metadata</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onProfileSubmit)} className="space-y-6">
            <div className="flex items-start gap-6">
              {/* Avatar */}
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user?.avatarUrl || undefined} alt={user?.displayName || user?.username || 'User'} />
                  <AvatarFallback className="bg-[oklch(0.6_0.15_250)] text-white text-2xl">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                {isEditing && (
                  <label
                    htmlFor="avatar-upload"
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <Camera className="h-8 w-8 text-white" />
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/gif"
                      onChange={handleAvatarUpload}
                      className="sr-only"
                      disabled={uploadAvatar.isPending}
                    />
                  </label>
                )}
              </div>

              {/* Profile Fields */}
              <div className="flex-1 space-y-4">
                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  {isEditing ? (
                    <div className="space-y-1">
                      <Input
                        id="displayName"
                        maxLength={50}
                        placeholder="Enter display name"
                        {...register('displayName')}
                      />
                      {errors.displayName && (
                        <p className="text-sm text-destructive">{errors.displayName.message}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm">
                      {user?.displayName || <span className="text-muted-foreground">Not set</span>}
                    </p>
                  )}
                </div>

                {/* Username (read-only) */}
                <div className="space-y-2">
                  <Label>Username</Label>
                  <p className="text-sm">{user?.username}</p>
                </div>

                {/* Account Metadata */}
                <div className="flex items-center gap-4 pt-2 flex-wrap">
                  {user?.createdAt && (
                    <div className="text-sm text-muted-foreground">
                      Member since {format(new Date(user.createdAt), 'MMMM yyyy')}
                    </div>
                  )}
                  {user?.lastLoginAt && (
                    <div className="text-sm text-muted-foreground">
                      Last login: {formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })}
                    </div>
                  )}
                  {user?.isAdmin && (
                    <Badge variant="secondary">Admin</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Edit Controls */}
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                  <Button type="button" variant="outline" onClick={handleEditToggle}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={handleEditToggle}>
                  Edit Profile
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Security Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle>Security Settings</CardTitle>
          <CardDescription>Manage your password and two-factor authentication</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Change Password */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Change Password</p>
              <p className="text-sm text-muted-foreground">Update your account password</p>
            </div>
            <Button onClick={() => setPasswordDialogOpen(true)}>Change Password</Button>
          </div>

          {/* Two-Factor Authentication */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <div className="flex items-center gap-2 mt-1">
                {user?.totpEnabled && (
                  <>
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <p className="text-sm text-muted-foreground">Enabled</p>
                  </>
                )}
              </div>
            </div>
            <Button onClick={() => setTotpDialogOpen(true)}>Regenerate</Button>
          </div>
        </CardContent>
      </Card>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={handlePasswordDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <PasswordChange
              onSubmit={handlePasswordChange}
              isLoading={changePassword.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* TOTP Regeneration Dialog */}
      <Dialog open={totpDialogOpen} onOpenChange={handleTotpDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Set up a new authenticator for your account
            </DialogDescription>
          </DialogHeader>
          {showTotpWarning ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium text-sm">Warning</p>
                    <p className="text-sm text-muted-foreground">
                      This will invalidate your current authenticator app setup. You will need to scan a new QR code.
                    </p>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleTotpRegenerate}
                disabled={setupTOTP.isPending}
                className="w-full"
              >
                {setupTOTP.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </div>
          ) : (
            <TOTPSetup
              qrCodeDataURL={totpQrCode}
              onVerify={handleTotpVerify}
              onSetup={handleTotpRegenerate}
              isLoading={verifyTOTPSetup.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
