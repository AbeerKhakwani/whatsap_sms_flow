# Dashboard Enhancement Plan: Profile Changes & Address Management

## 📋 Overview
Add seller profile management and address tracking to the dashboard. This allows sellers to update their information, manage multiple addresses, and view address history.

---

## 🎯 Goals

1. ✅ Allow sellers to view/edit their profile (name, phone, email)
2. ✅ Add address management (add, edit, delete, set default)
3. ✅ Track address changes in audit log
4. ✅ Link addresses to transactions/payouts
5. ✅ Validate addresses before saving

---

## 📁 Files to Create/Modify

### NEW FILES

```
src/pages/seller/
  ├─ SellerProfile.jsx          (Main profile page)
  ├─ AddressManager.jsx         (Address CRUD component)
  └─ ProfileForm.jsx            (Profile edit form)

src/components/
  └─ AddressCard.jsx            (Address display card)

api/
  ├─ seller-profile.js          (Profile endpoints)
  └─ seller-address.js          (Address endpoints)

lib/
  └─ address-validation.js      (Validate & format addresses)

scripts/
  └─ create-address-tables.sql  (Database schema)
```

---

## 🗄️ Database Schema

### `seller_profiles`
```sql
CREATE TABLE seller_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id INTEGER UNIQUE REFERENCES sellers(id) ON DELETE CASCADE,
  
  -- Profile info
  full_name TEXT,
  phone_number TEXT,
  email TEXT,
  profile_picture_url TEXT,
  bio TEXT,
  
  -- Statistics (denormalized for performance)
  total_listings INTEGER DEFAULT 0,
  total_sold INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  average_rating DECIMAL(3,2),
  
  -- Settings
  notifications_enabled BOOLEAN DEFAULT true,
  newsletter_subscribed BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `seller_addresses`
```sql
CREATE TABLE seller_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  
  -- Address details
  label TEXT NOT NULL, -- "Home", "Office", "Warehouse"
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  
  street_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT DEFAULT 'Pakistan',
  
  -- Address type
  address_type TEXT DEFAULT 'home', -- home, business, other
  
  -- Flags
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Validation
  is_verified BOOLEAN DEFAULT false,
  verification_code TEXT,
  verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_seller_addresses_seller_id ON seller_addresses(seller_id);
CREATE INDEX idx_seller_addresses_default ON seller_addresses(seller_id, is_default);
```

### `address_audit_log`
```sql
CREATE TABLE address_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  address_id UUID REFERENCES seller_addresses(id),
  
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'verified', 'set_default'
  
  -- What changed
  old_value JSONB,
  new_value JSONB,
  
  -- Context
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_seller_id ON address_audit_log(seller_id);
CREATE INDEX idx_audit_created_at ON address_audit_log(created_at DESC);
```

---

## 🔧 API Endpoints

### Profile Endpoints

#### `GET /api/seller-profile`
```javascript
// Get seller profile
Response: {
  success: true,
  profile: {
    id: "uuid",
    seller_id: 42,
    full_name: "Akbari Khan",
    phone_number: "+923001234567",
    email: "ak@gmail.com",
    profile_picture_url: "https://...",
    bio: "...",
    total_listings: 15,
    total_sold: 8,
    total_revenue: 3200.50,
    average_rating: 4.8
  }
}
```

#### `PUT /api/seller-profile`
```javascript
// Update profile
Request: {
  full_name: "Akbari Khan",
  phone_number: "+923001234567",
  bio: "Pakistani fashion reseller"
}

Response: {
  success: true,
  profile: { ... }
}
```

---

### Address Endpoints

#### `GET /api/seller-address?action=list`
```javascript
// Get all addresses for seller
Response: {
  success: true,
  addresses: [
    {
      id: "uuid",
      label: "Home",
      full_name: "Akbari Khan",
      street_address: "123 Main St",
      city: "Karachi",
      state: "Sindh",
      postal_code: "74000",
      is_default: true,
      is_verified: true
    },
    // ...
  ],
  default_address_id: "uuid"
}
```

#### `POST /api/seller-address?action=create`
```javascript
// Add new address
Request: {
  label: "Office",
  full_name: "Akbari Khan",
  phone_number: "+923001234567",
  street_address: "456 Business Ave",
  city: "Islamabad",
  state: "ICT",
  postal_code: "44000",
  address_type: "business"
}

Response: {
  success: true,
  address: { id: "uuid", ... }
}
```

#### `PUT /api/seller-address?action=update&id=<addressId>`
```javascript
// Update address
Request: {
  label: "Home Updated",
  street_address: "789 New St",
  // ... other fields
}

Response: {
  success: true,
  address: { ... }
}
```

#### `POST /api/seller-address?action=set-default&id=<addressId>`
```javascript
// Set as default address
Response: {
  success: true,
  message: "Default address updated"
}
```

#### `DELETE /api/seller-address?action=delete&id=<addressId>`
```javascript
// Delete address (soft delete)
Response: {
  success: true,
  message: "Address deleted"
}
```

#### `GET /api/seller-address?action=audit`
```javascript
// Get address change history
Response: {
  success: true,
  audit_log: [
    {
      id: "uuid",
      action: "created",
      address: { ... },
      created_at: "2026-01-14T10:30:00Z"
    },
    // ...
  ]
}
```

---

## 🎨 UI Components

### `SellerProfile.jsx` (Main Page)
```jsx
export default function SellerProfile() {
  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <ProfileCard />
      
      {/* Edit Profile Form */}
      <ProfileForm />
      
      {/* Address Management */}
      <AddressManager />
      
      {/* Change History */}
      <AuditLog />
    </div>
  );
}
```

### `ProfileForm.jsx` Component
```jsx
// Fields:
// - Full Name (text)
// - Phone Number (tel)
// - Email (email, read-only)
// - Bio (textarea)
// - Profile Picture (file upload)
// - Notification preferences (checkbox)
// - Newsletter subscription (checkbox)

// Features:
// - Auto-save on blur
// - Validation feedback
// - Success toast on save
// - Conflict detection (if another tab saves)
```

### `AddressManager.jsx` Component
```jsx
// Display:
// - List of all addresses
// - Default address highlighted
// - Add address button
// - Edit/Delete buttons on each

// Features:
// - Add new address modal
// - Edit existing address modal
// - Set as default
// - Delete confirmation
// - Address validation before save
// - Address history/audit log
```

### `AddressCard.jsx` Component
```jsx
// Display format:
// ┌─────────────────────┐
// │ 📍 Home (DEFAULT)   │
// │ Akbari Khan         │
// │ +923001234567       │
// │                     │
// │ 123 Main St         │
// │ Karachi, Sindh      │
// │ 74000, Pakistan     │
// │                     │
// │ ✓ Verified          │
// │ [Edit] [Delete]     │
// └─────────────────────┘
```

---

## 🔄 User Flows

### Flow 1: Update Profile

```
User opens Profile page
  ↓
See current profile info
  ↓
Click "Edit Profile"
  ↓
Fill form fields
  - Full Name
  - Phone
  - Bio
  - Upload picture
  ↓
Click "Save"
  ↓
Validate inputs
  ↓
PUT /api/seller-profile
  ↓
Update sms_conversations if phone changed
  ↓
Show success toast
  ↓
Profile updated
```

### Flow 2: Add Address

```
Click "Add Address"
  ↓
Modal opens with form
  - Label (Home/Office/Other)
  - Full Name
  - Phone
  - Address fields
  - Address Type
  ↓
Fill fields
  ↓
Click "Save Address"
  ↓
Validate address format
  ↓
POST /api/seller-address
  ↓
INSERT into seller_addresses
  ↓
Log to audit_log
  ↓
Refresh address list
  ↓
Show success toast
```

### Flow 3: Set Default Address

```
Click "Set Default" on address card
  ↓
POST /api/seller-address?action=set-default
  ↓
UPDATE seller_addresses
  - Set is_default = false (all others)
  - Set is_default = true (selected)
  ↓
Log to audit_log
  ↓
Refresh UI (highlight new default)
  ↓
Show toast: "Default address updated"
```

---

## 📊 Validation Rules

### Profile Fields
```javascript
{
  full_name: {
    type: 'string',
    minLength: 3,
    maxLength: 100,
    pattern: /^[a-zA-Z\s'-]+$/
  },
  phone_number: {
    type: 'string',
    pattern: /^\+92[0-9]{10}$/, // Pakistani format
    unique: true // One per seller
  },
  bio: {
    type: 'string',
    maxLength: 500
  }
}
```

### Address Fields
```javascript
{
  label: {
    type: 'string',
    enum: ['Home', 'Office', 'Warehouse', 'Other'],
    required: true
  },
  full_name: {
    type: 'string',
    minLength: 3,
    maxLength: 100,
    required: true
  },
  phone_number: {
    type: 'string',
    pattern: /^\+92[0-9]{10}$/,
    required: true
  },
  street_address: {
    type: 'string',
    minLength: 5,
    maxLength: 200,
    required: true
  },
  city: {
    type: 'string',
    minLength: 2,
    maxLength: 100,
    required: true
  },
  state: {
    type: 'string',
    minLength: 2,
    maxLength: 100,
    required: true
  },
  postal_code: {
    type: 'string',
    pattern: /^[0-9]{5}$/,
    required: true
  }
}
```

---

## 🔐 Security Considerations

1. **Authentication**
   - Seller can only view/edit their own profile
   - Use seller_id from JWT token

2. **Authorization**
   - Check seller_id matches authenticated user
   - Phone number can only be edited by profile owner

3. **Audit Trail**
   - Log all address changes
   - Store old values for comparison
   - Include IP address & user agent

4. **Validation**
   - Server-side validation of all fields
   - Sanitize inputs before DB
   - Prevent injection attacks

5. **Rate Limiting**
   - Limit profile updates to 1 per minute
   - Limit address creation to 10 per day

---

## 📈 Implementation Phases

### Phase 1: Database & Core APIs ✅
1. Create database tables
2. Implement profile endpoints (GET, PUT)
3. Implement address endpoints (CRUD)
4. Add validation logic

### Phase 2: UI Components
1. Build SellerProfile.jsx
2. Build ProfileForm.jsx
3. Build AddressManager.jsx
4. Build AddressCard.jsx

### Phase 3: Integration
1. Add routing to dashboard
2. Add navigation links
3. Connect to seller context/state
4. Handle errors and edge cases

### Phase 4: Testing & Polish
1. Unit tests for APIs
2. E2E tests for flows
3. Performance optimization
4. Mobile responsiveness

---

## 📝 Related Changes

### Update `sms-webhook.js`
- When phone changes in profile, update sms_conversations table
- Keep seller_id consistent across tables

### Update Settings.jsx
- Replace "Coming next!" with link to SellerProfile
- Or embed profile component

### Update seller context/state management
- Add profile data to global state
- Cache profile info on login
- Handle profile updates globally

---

## 🎯 Success Criteria

- ✅ Sellers can view their profile
- ✅ Sellers can edit profile info
- ✅ Sellers can add multiple addresses
- ✅ Sellers can set default address
- ✅ Address changes are logged
- ✅ All inputs validated
- ✅ Mobile responsive
- ✅ Performance < 500ms load time
- ✅ No security vulnerabilities
- ✅ 95%+ test coverage

