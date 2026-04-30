"use client";

import React, { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import { httpClient } from "@/utils/httpClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import NotAuthenticatedState from "@/components/NotAuthenticatedState";
import AlertMessage from "@/components/AlertMessage";
import PageHeader from "@/components/PageHeader";

interface ProfileData {
  user: {
    id: number;
    name: string;
    email: string;
    last_login: string;
  };
  profile: {
    phone: string;
  } | null;
  address: {
    address_line: string;
    address_line2: string;
    city: string;
    postal_code: string;
  } | null;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordChangeData, setPasswordChangeData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address_line: "",
    address_line2: "",
    city: "",
    postal_code: "",
  });

  // Fetch profile data
  useEffect(() => {
    if (user) {
      fetchProfileData();
    }
  }, [user]);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const data = await httpClient.get<ProfileData>("/api/auth/profile/");
      setProfileData(data);

      // Populate form data
      setFormData({
        name: data.user.name || "",
        phone: data.profile?.phone || "",
        address_line: data.address?.address_line || "",
        address_line2: data.address?.address_line2 || "",
        city: data.address?.city || "",
        postal_code: data.address?.postal_code || "",
      });
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      setError("Failed to load profile data");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Validate required fields
      if (!formData.name.trim()) {
        setError("Full name is required");
        setSaving(false);
        return;
      }

      const updateData = {
        name: formData.name.trim(),
        phone: formData.phone,
        address: {
          address_line: formData.address_line,
          address_line2: formData.address_line2,
          city: formData.city,
          postal_code: formData.postal_code,
        },
      };

      const responseData = await httpClient.put<{ profile: ProfileData }>(
        "/api/auth/profile/update/",
        updateData
      );

      if (responseData.profile) {
        setProfileData(responseData.profile);
        setSuccess("Profile updated successfully!");
        setIsEditing(false);
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: unknown) {
      console.error("Failed to update profile:", err);
      const errorMessage =
        err &&
        typeof err === "object" &&
        "response" in err &&
        err.response &&
        typeof err.response === "object" &&
        "data" in err.response &&
        err.response.data &&
        typeof err.response.data === "object" &&
        "error" in err.response.data
          ? (err.response.data as { error: string }).error
          : "Failed to update profile";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profileData) {
      setFormData({
        name: profileData.user.name || "",
        phone: profileData.profile?.phone || "",
        address_line: profileData.address?.address_line || "",
        address_line2: profileData.address?.address_line2 || "",
        city: profileData.address?.city || "",
        postal_code: profileData.address?.postal_code || "",
      });
    }
    setIsEditing(false);
    setError(null);
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasLetter || !hasNumber) {
      return "Password must contain at least one letter and one number";
    }

    return null;
  };

  const handlePasswordChange = async () => {
    try {
      setPasswordChangeLoading(true);
      setError(null);

      const { currentPassword, newPassword, confirmPassword } =
        passwordChangeData;

      // Validate required fields
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError("All password fields are required");
        return;
      }

      // Validate new password strength
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        setError(passwordError);
        return;
      }

      // Check if new password is different from current
      if (currentPassword === newPassword) {
        setError("New password must be different from current password");
        return;
      }

      // Check if new passwords match
      if (newPassword !== confirmPassword) {
        setError("New passwords do not match");
        return;
      }

      const response = await httpClient.post<{ message: string }>(
        "/api/auth/change-password/",
        {
          old_password: currentPassword,
          new_password: newPassword,
        }
      );

      if (response.message) {
        setSuccess("Password changed successfully!");
        setShowPasswordChange(false);
        setPasswordChangeData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err: unknown) {
      console.error("Failed to change password:", err);
      const errorMessage =
        err &&
        typeof err === "object" &&
        "response" in err &&
        err.response &&
        typeof err.response === "object" &&
        "data" in err.response &&
        err.response.data &&
        typeof err.response.data === "object" &&
        "error" in err.response.data
          ? (err.response.data as { error: string }).error
          : "Failed to change password";
      setError(errorMessage);
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  if (!user) {
    return (
      <NotAuthenticatedState
        title="Sign in to view your profile"
        description="You need to be signed in to access your profile and manage your account."
        signInHref={getAuthUrl({ next: "/profile" })}
        showShopLink
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-[var(--sidebar-bg)] rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-[var(--sidebar-bg)] rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-32 bg-[var(--sidebar-bg)] rounded"
                ></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8" style={{ background: "var(--background)" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <PageHeader
          title="My Profile"
          subtitle="Manage your account information and preferences"
        />

        {success && (
          <AlertMessage variant="success" className="mb-6">
            {success}
          </AlertMessage>
        )}
        {error && (
          <AlertMessage variant="error" className="mb-6">
            {error}
          </AlertMessage>
        )}

        {/* Profile Overview */}
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--sidebar-border)] p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              Profile Overview
            </h2>
            {!isEditing && (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                size="sm"
              >
                Edit Profile
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* User Avatar & Basic Info */}
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-[var(--primary)] rounded-full flex items-center justify-center text-white text-xl font-bold">
                {profileData?.user.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">
                  {profileData?.user.name || "No name set"}
                </h3>
                <p className="text-[var(--muted-foreground)]">
                  {profileData?.user.email || "No email set"}
                </p>
              </div>
            </div>

            {/* Account Status */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center space-x-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: "var(--success)" }}
                />
                <span
                  className="text-sm"
                  style={{ color: "var(--foreground)" }}
                >
                  Account Active
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Information Form */}
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--sidebar-border)] p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-6">
            Personal Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isEditing ? (
              <Input
                label="Full Name *"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                required
              />
            ) : (
              <div className="space-y-4">
                <div className="border-b border-[var(--sidebar-border)] pb-2">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-2">
                    Full Name
                  </label>
                  <div className="text-lg font-semibold text-[var(--foreground)]">
                    {profileData?.user.name || "No name set"}
                  </div>
                </div>
              </div>
            )}
            {isEditing ? (
              <Input
                label="Phone Number"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="Enter your phone number"
              />
            ) : (
              <div className="space-y-4">
                <div className="border-b border-[var(--sidebar-border)] pb-2">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-2">
                    Phone Number
                  </label>
                  <div className="text-lg font-semibold text-[var(--foreground)]">
                    {profileData?.profile?.phone || "No phone number set"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Address Information */}
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--sidebar-border)] p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-6">
            Address Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isEditing ? (
              <Input
                label="Address Line 1"
                name="address_line"
                value={formData.address_line}
                onChange={handleInputChange}
                placeholder="Street address, P.O. box, etc."
              />
            ) : (
              <div className="space-y-4">
                <div className="border-b border-[var(--sidebar-border)] pb-2">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-2">
                    Address Line 1
                  </label>
                  <div className="text-lg font-semibold text-[var(--foreground)]">
                    {profileData?.address?.address_line || "No address set"}
                  </div>
                </div>
              </div>
            )}
            {isEditing ? (
              <Input
                label="Address Line 2"
                name="address_line2"
                value={formData.address_line2}
                onChange={handleInputChange}
                placeholder="Apartment, suite, unit, building, floor, etc."
              />
            ) : (
              <div className="space-y-4">
                <div className="border-b border-[var(--sidebar-border)] pb-2">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-2">
                    Address Line 2
                  </label>
                  <div className="text-lg font-semibold text-[var(--foreground)]">
                    {profileData?.address?.address_line2 ||
                      "No additional address"}
                  </div>
                </div>
              </div>
            )}
            {isEditing ? (
              <Input
                label="City"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="Enter your city"
              />
            ) : (
              <div className="space-y-4">
                <div className="border-b border-[var(--sidebar-border)] pb-2">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-2">
                    City
                  </label>
                  <div className="text-lg font-semibold text-[var(--foreground)]">
                    {profileData?.address?.city || "No city set"}
                  </div>
                </div>
              </div>
            )}
            {isEditing ? (
              <Input
                label="Postal Code"
                name="postal_code"
                value={formData.postal_code}
                onChange={handleInputChange}
                placeholder="Enter your postal code"
              />
            ) : (
              <div className="space-y-4">
                <div className="border-b border-[var(--sidebar-border)] pb-2">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-2">
                    Postal Code
                  </label>
                  <div className="text-lg font-semibold text-[var(--foreground)]">
                    {profileData?.address?.postal_code || "No postal code set"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Password Reset Section */}
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--sidebar-border)] p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Password & Security
              </h2>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">
                Manage your password and account security
              </p>
            </div>
            <Button
              onClick={() => setShowPasswordChange(true)}
              variant="outline"
              size="sm"
            >
              Change Password
            </Button>
          </div>

          {showPasswordChange && (
            <div
              className="pt-6"
              style={{ borderTop: "1px solid var(--sidebar-border)" }}
            >
              <div className="max-w-md">
                <h3
                  className="text-base font-semibold mb-1"
                  style={{ color: "var(--foreground)" }}
                >
                  Change Your Password
                </h3>
                <p
                  className="text-sm mb-4"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Enter your current password and choose a new secure password.
                </p>

                {[
                  {
                    id: "current-password",
                    label: "Current Password",
                    value: passwordChangeData.currentPassword,
                    show: showCurrentPassword,
                    toggle: () => setShowCurrentPassword(!showCurrentPassword),
                    onChange: (v: string) =>
                      setPasswordChangeData({
                        ...passwordChangeData,
                        currentPassword: v,
                      }),
                    placeholder: "Enter your current password",
                  },
                  {
                    id: "new-password",
                    label: "New Password",
                    value: passwordChangeData.newPassword,
                    show: showNewPassword,
                    toggle: () => setShowNewPassword(!showNewPassword),
                    onChange: (v: string) =>
                      setPasswordChangeData({
                        ...passwordChangeData,
                        newPassword: v,
                      }),
                    placeholder: "Min 8 characters, letters & numbers",
                  },
                  {
                    id: "confirm-password",
                    label: "Confirm New Password",
                    value: passwordChangeData.confirmPassword,
                    show: showConfirmPassword,
                    toggle: () => setShowConfirmPassword(!showConfirmPassword),
                    onChange: (v: string) =>
                      setPasswordChangeData({
                        ...passwordChangeData,
                        confirmPassword: v,
                      }),
                    placeholder: "Re-enter new password",
                  },
                ].map((field) => (
                  <div key={field.id} className="mb-4">
                    <label
                      htmlFor={field.id}
                      className="block text-sm font-medium mb-1.5"
                      style={{ color: "var(--foreground)" }}
                    >
                      {field.label}
                    </label>
                    <div className="relative">
                      <input
                        id={field.id}
                        type={field.show ? "text" : "password"}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 pr-10 rounded-lg text-sm border outline-none transition-colors"
                        style={{
                          background: "var(--background)",
                          color: "var(--foreground)",
                          borderColor: "var(--sidebar-border)",
                        }}
                        placeholder={field.placeholder}
                        required
                      />
                      <button
                        type="button"
                        onClick={field.toggle}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:opacity-70 transition-opacity"
                        style={{ color: "var(--muted-foreground)" }}
                        aria-label={
                          field.show ? "Hide password" : "Show password"
                        }
                      >
                        {field.show ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-3 mt-2">
                  <Button
                    onClick={handlePasswordChange}
                    disabled={passwordChangeLoading}
                    className="min-w-[120px]"
                  >
                    {passwordChangeLoading ? "Changing…" : "Change Password"}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowPasswordChange(false);
                      setPasswordChangeData({
                        currentPassword: "",
                        newPassword: "",
                        confirmPassword: "",
                      });
                      setError(null);
                    }}
                    variant="outline"
                    disabled={passwordChangeLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {isEditing && (
          <div className="flex justify-end space-x-4">
            <Button onClick={handleCancel} variant="outline" disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="min-w-[120px]"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
