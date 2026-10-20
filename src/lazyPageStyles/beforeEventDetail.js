// Stylesheets of the pages App.jsx loads on demand (lazyWithReload).
//
// Only the page JavaScript is split off. Their CSS stays in the main
// stylesheet, in the same order as before the split: several of these files
// carry global rules (`textarea`, `input:disabled`, `.btn-disabled`, ...) that
// other pages rely on, and the cascade depends on the order. Imported from
// App.jsx at the position the page imports used to have: this file before
// EventDetailPage, afterEventDetail.js after it.
//
// When a lazy page (or a component only it uses) gets a new stylesheet, add
// it here too. tests/components/lazyPageStyles.spec.ts checks the lists.

// LoginPage
import '../components/AuthForm.css';
import '../components/PasswordInput.css';

// AdminPage
import '../components/RecurringDeleteDialog.css';
import '../components/OccurrencePickerDialog.css';
import '../components/SuccessDialog.css';
import '../components/StatusBadge.css';
import '../components/EventAdminListRow.css';
import '../components/EventList.css';
import '../components/ReviewTab.css';
import '../components/MessagesTab.css';
import '../components/FeedbackTab.css';
import '../components/ColorPicker.css';
import '../components/CategoryEditDialog.css';
import '../components/CategoriesTab.css';
import '../components/ThemeTokenInfoDialog.css';
import '../components/SaveThemeDialog.css';
import '../components/ThemeTab.css';
import '../components/HelperEditDialog.css';
import '../components/HelpersTab.css';
import '../components/DonorEditDialog.css';
import '../components/DonorsTab.css';
import '../components/MembersTab.css';
import '../components/InstagramTab.css';
import '../components/AnalyticsTab.css';
import '../components/MailgunTab.css';
import '../components/EmailVerificationBanner.css';
import '../components/EventStatusMismatchBanner.css';
import '../components/ModerationTab.css';
import '../components/RegionsTab.css';
import '../components/RegionAboutTab.css';
import '../pages/AdminPage.css';

// EventFormPage
import '../components/FocalPointPicker.css';
import '../components/InstagramConsentField.css';
import '../components/InstagramImagePicker.css';
import '../components/EventForm.css';
import '../components/RichTextView.css';
import '../components/EventFormWizard.css';

// LegalPage
import '../pages/LegalPage.css';
