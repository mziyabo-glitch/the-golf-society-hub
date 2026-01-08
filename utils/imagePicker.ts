/**
 * Image picker utility for logo upload
 * Uses expo-image-picker if available, otherwise provides fallback
 */

import * as ImagePicker from "expo-image-picker";
import { Platform, Alert } from "react-native";

export type ImagePickerResult = {
  uri: string;
  width: number;
  height: number;
  type?: string;
};

/**
 * Request media library permissions
 */
export async function requestMediaLibraryPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    return true; // Web doesn't need permissions
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permission Required",
      "We need access to your photos to upload a logo."
    );
    return false;
  }
  return true;
}

/**
 * Pick an image from the library
 */
export async function pickImage(): Promise<ImagePickerResult | null> {
  const hasPermission = await requestMediaLibraryPermissions();
  if (!hasPermission) {
    return null;
  }

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square logo
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      type: asset.mimeType,
    };
  } catch (error) {
    console.error("Error picking image:", error);
    Alert.alert("Error", "Failed to pick image");
    return null;
  }
}














