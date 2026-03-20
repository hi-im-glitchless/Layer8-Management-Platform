# Dependencies

## Backend (Node.js/Express)

### Core
| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.x | HTTP server framework |
| @prisma/client | ^6.x | SQLite ORM |
| connect-redis | ^8.x | Redis session store |
| express-session | ^1.x | Session management |
| ioredis | ^5.x | Redis client |

### Auth & Security
| Package | Version | Purpose |
|---------|---------|---------|
| argon2 | ^0.41 | Password hashing (Argon2id) |
| otplib | ^12.x | TOTP generation/verification |
| qrcode | ^1.x | QR code for TOTP setup |
| csrf-csrf | ^3.x | Double-submit CSRF protection |
| express-rate-limit | ^7.x | Rate limiting |

### Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| zod | ^3.x | Schema validation (config, requests) |
| multer | ^1.x | File upload handling |
| dotenv | ^16.x | Environment variable loading |
| tsx | ^4.x | TypeScript execution (dev) |

## Frontend (React/Vite)

### Core
| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.x | UI framework |
| react-dom | ^19.x | DOM rendering |
| react-router | ^7.x | Client-side routing |
| @tanstack/react-query | ^5.x | Server state management |
| react-hook-form | ^7.x | Form state management |
| zod | ^3.x | Schema validation |

### UI
| Package | Version | Purpose |
|---------|---------|---------|
| tailwindcss | ^4.x | Utility CSS |
| @radix-ui/* | various | Headless UI primitives (shadcn/ui) |
| lucide-react | ^0.x | Icon library |
| sonner | ^2.x | Toast notifications |

## Sanitization Service (Python)

### Core
| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | latest | Async HTTP framework |
| uvicorn | latest | ASGI server |
| presidio-analyzer | latest | PII detection engine |
| presidio-anonymizer | latest | PII replacement engine |
| spacy | latest | NLP pipeline (entity recognition) |
| fast-langdetect | latest | Language detection |
| pydantic | ^2.x | Request/response validation |
