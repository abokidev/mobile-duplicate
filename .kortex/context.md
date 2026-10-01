<!-- Kortex context — auto-generated, do not edit. Add .kortex/ to .gitignore -->
# Kortex Project Intelligence
_Generated: 2026-10-01T21:27:33.698Z_

## Affirmed Decisions

### Asynchronous File Download
The function uses an asynchronous HTTP client to download files from SharePoint, allowing for non-blocking I/O operations and potentially improving performance in high-load scenarios.
_Tags: asynchronous, performance, blocking, scan-repo_
_Symbol: `CDICheckUrlRequest`_
_Confidence: 35%_

### Data Model for Extraction Response
The function defines a data model for responses from extraction endpoints, including essential fields like document type and counts, as well as optional fields for specific scenarios.
_Tags: data modeling, API response, auto-analysed_
_Symbol: `ExtractionResponse`_
_Confidence: 35%_

### Extensible Document Type System
The function defines an enumeration for document types, allowing for easy addition of new document types in the future without modifying existing code.
_Tags: enum, extensibility, auto-analysed_
_Symbol: `ItemDocumentType`_
_Confidence: 35%_

### Policy Document Validation Function
The function checks for specific sections (purpose, scope, responsibilities) in policy documents to ensure they meet creation standards.
_Tags: security, standards, compliance, scan-repo_
_Symbol: `check_03_purpose_section`_
_Confidence: 100%_

### Standard Compliance Check Function
This function checks for specific standard references, related documents sections, and classification labels in a given text, ensuring compliance with certain document creation standards.
_Tags: security, standards, document-management, scan-repo_
_Symbol: `check_09_standards_references`_
_Confidence: 100%_

### Validation Function Implementation
The function implements validation checks for specific sections and formats within a document to ensure compliance with standards.
_Tags: document validation, standards adherence, quality control, scan-repo_
_Symbol: `check_01_document_code`_
_Confidence: 100%_

### Standardization of Document Sections
The functions represent a standardization approach to ensure documents include essential sections like revision history, purpose, scope, and responsibilities.
_Tags: document_structure, compliance, standards, scan-repo_
_Symbol: `check_02_revision_history`_
_Confidence: 100%_

### Standardized Document Sections
Ensuring compliance with document creation standards by checking for specific sections like purpose, scope, and responsibilities.
_Tags: security, standards, documentation, scan-repo_
_Symbol: `check_03_purpose_section`_
_Confidence: 100%_

### Validation Function Implementation
The function is designed to validate specific sections within a document based on predefined criteria, ensuring compliance with standards.
_Tags: validation, compliance, architectural_choice, scan-repo_
_Symbol: `check_10_related_documents`_
_Confidence: 100%_

### Policy Document Structure Check
The function checks for specific sections (Revision History, Purpose, Scope, Responsibilities) in a policy document text to ensure compliance with standards.
_Tags: document validation, policy standards, architectural guidelines, scan-repo_
_Symbol: `check_02_revision_history`_
_Confidence: 100%_

## Recent Notes & Context

- **Campaign and Vacancy Management System**: This project is designed to facilitate the management of campaigns, vacancies, and candidate applications for clients. It serves users such as recruiters, hiring managers, and administrators by provid
- **Architectural focus on refactoring and scalability**: The team has prioritized refactoring critical functions like normalizeStatusLabel and buildEligibilitySystemPrompt to improve readability, maintainability, and modularity. Security is another key focu
- **Purpose and Audience of Project**: The project appears to focus on improving user experience and security within an application that handles campaigns, vacancies, and file management. Functions like `normalizeStatusLabel`, `safeFileNam
- **Critical Functions and Maintenance Risks**: The most structurally critical parts of the system cannot be definitively identified due to the lack of structural graph data. However, functions like 'trigger_classifier,' '_pass,' and 'authenticated
- **Purpose and Audience of the Project**: The project's purpose appears to involve document processing and classification, with a focus on improving scalability, maintainability, and reliability. Functions like 'trigger_classifier' and 'extra
