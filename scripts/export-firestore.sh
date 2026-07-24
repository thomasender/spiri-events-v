#!/bin/bash
# Firestore export using Firebase CLI REST API directly
# Alternative: Export manually from Firebase Console > Firestore > Export/Import

PROJECT_ID="spirieventsvbg"
OUT_DIR="./data-export/firestore-export"

echo "Firestore export options:"
echo ""
echo "1. Use Firebase Console (quick, one-time):"
echo "   - Go to https://console.firebase.google.com/project/$PROJECT_ID/firestore"
echo "   - Click 'Export Data' in the overflow menu (⋮)"
echo "   - Save to Cloud Storage bucket"
echo "   - Download from Cloud Storage and extract to: $OUT_DIR"
echo ""
echo "2. Or install gcloud CLI:"
echo "   brew install google-cloud-sdk"
echo "   gcloud firestore export gs://$PROJECT_ID.appspot.com/firestore-export --project=$PROJECT_ID"
echo ""
echo "3. Manual JSON export from Console:"
echo "   Firebase Console > Firestore > Data > Select collection > Copy as JSON"
