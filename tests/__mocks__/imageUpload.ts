export const uploadImage = async () => 'https://example.com/image.jpg';
export const uploadEventCover = async () => ({
  url: 'https://example.com/image.jpg',
  thumbUrl: null,
});
export const getImageDimensions = async () => ({ width: 1920, height: 1080 });
export const validateAspectRatio = () => true;
