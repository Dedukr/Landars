"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { httpClient } from "@/utils/httpClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <div className="mb-6 text-8xl">🔐</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Please sign in to view your profile
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              You need to be signed in to access your profile and manage your
              account information.
            </p>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors"
              style={{
                background: "var(--primary)",
                color: "white",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--primary)";
              }}
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
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
    <div className="min-h-screen bg-[var(--background)] py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
            My Profile
          </h1>
          <p className="text-[var(--muted-foreground)]">
            Manage your account information and preferences
          </p>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
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
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-[var(--foreground)]">
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
            <div className="border-t border-[var(--sidebar-border)] pt-6">
              <div className="max-w-md">
                <h3 className="text-lg font-medium text-[var(--foreground)] mb-4">
                  Change Your Password
                </h3>
                <p className="text-sm text-[var(--muted-foreground)] mb-4">
                  Enter your current password and choose a new secure password.
                </p>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="current-password"
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--foreground)" }}
                    >
                      Current Password
                    </label>
                    <div className="flex items-end gap-2">
                      <input
                        id="current-password"
                        type={showCurrentPassword ? "text" : "password"}
                        value={passwordChangeData.currentPassword}
                        onChange={(e) =>
                          setPasswordChangeData({
                            ...passwordChangeData,
                            currentPassword: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter your current password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowCurrentPassword(!showCurrentPassword)
                        }
                        className="flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity border-0 bg-transparent"
                        style={{
                          color: "var(--foreground)",
                          background: "none",
                          paddingLeft: "8px",
                          paddingRight: "8px",
                          paddingTop: "4px",
                          paddingBottom: "4px",
                        }}
                        aria-label={
                          showCurrentPassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        {showCurrentPassword ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-6 h-6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                            />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-6 h-6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="new-password"
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--foreground)" }}
                    >
                      New Password
                    </label>
                    <div className="flex items-end gap-2">
                      <input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={passwordChangeData.newPassword}
                        onChange={(e) =>
                          setPasswordChangeData({
                            ...passwordChangeData,
                            newPassword: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter new password (min 8 characters, letters and numbers)"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity border-0 bg-transparent"
                        style={{
                          color: "var(--foreground)",
                          background: "none",
                          paddingLeft: "8px",
                          paddingRight: "8px",
                          paddingTop: "4px",
                          paddingBottom: "4px",
                        }}
                        aria-label={
                          showNewPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showNewPassword ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-6 h-6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                            />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-6 h-6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--foreground)" }}
                    >
                      Confirm New Password
                    </label>
                    <div className="flex items-end gap-2">
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={passwordChangeData.confirmPassword}
                        onChange={(e) =>
                          setPasswordChangeData({
                            ...passwordChangeData,
                            confirmPassword: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Confirm your new password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity border-0 bg-transparent"
                        style={{
                          color: "var(--foreground)",
                          background: "none",
                          paddingLeft: "8px",
                          paddingRight: "8px",
                          paddingTop: "4px",
                          paddingBottom: "4px",
                        }}
                        aria-label={
                          showConfirmPassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        {showConfirmPassword ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-6 h-6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                            />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-6 h-6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <Button
                      onClick={handlePasswordChange}
                      disabled={passwordChangeLoading}
                      className="min-w-[120px]"
                    >
                      {passwordChangeLoading
                        ? "Changing..."
                        : "Change Password"}
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
