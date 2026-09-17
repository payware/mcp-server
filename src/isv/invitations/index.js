import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Merchant invitations - how an ISV onboards a merchant onto payware.
 *
 * This is the flow that produces the `merchantPartnerId` + `oauth2Token` pair every other ISV tool
 * here already requires, and until now nothing in this server could start it: the tools could act on
 * behalf of a merchant but not obtain a merchant to act for.
 *
 * **payware sends no email.** The API returns an `invitationLink` and the ISV delivers it through
 * its own channels. An assistant that creates an invitation and stops has not finished the job - the
 * link is the deliverable.
 *
 * **Authenticated as the ISV itself.** There is no merchant to act on behalf of yet, so these calls
 * carry a plain ISV JWT with no `aud`/`sub` on-behalf claims.
 */

const INVITATION_STATUSES = ['PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'];

async function isvRequest({ method, path, body, partnerId, privateKey, useSandbox }) {
  const minimizedBody = body ? createMinimizedJSON(body) : undefined;
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBody);
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
  return axios({
    method,
    url: `${baseUrl}${path}`,
    headers,
    ...(minimizedBody !== undefined && {
      data: minimizedBody,
      transformRequest: [(data) => data]
    })
  });
}

/** Create an invitation. Returns the link the ISV must deliver. */
export async function createInvitation({ partnerId, privateKey, useSandbox = true, ...fields }) {
  if (!fields.email) {
    throw new Error('email is required - it is what decides whether this is a REGISTRATION or an AUTHORIZATION_ONLY invitation');
  }
  if (fields.jurisdictionCode && !/^[a-zA-Z]{2}$/.test(fields.jurisdictionCode)) {
    // Not cosmetic: jurisdictionCode 'BG' triggers auto-population from the Bulgarian commercial
    // registry, so a malformed code silently takes a different path instead of failing.
    throw new Error('jurisdictionCode must be a two-letter ISO 3166-1 alpha-2 code, e.g. BG');
  }

  const body = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

  try {
    const response = await isvRequest({
      method: 'post', path: '/isv/invitations', body, partnerId, privateKey, useSandbox
    });
    return {
      success: true,
      invitation: response.data,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/** List this ISV's invitations, newest first. */
export async function listInvitations({ status, page = 0, size = 20, partnerId, privateKey, useSandbox = true }) {
  const query = new URLSearchParams();
  if (Array.isArray(status)) {
    status.forEach(s => query.append('status', s));
  } else if (status) {
    query.append('status', status);
  }
  query.set('page', String(page));
  // The server caps size at 100 regardless; capping here means the response matches what was asked
  // for rather than silently differing from it.
  query.set('size', String(Math.min(size, 100)));

  try {
    const response = await isvRequest({
      method: 'get', path: `/isv/invitations?${query.toString()}`, partnerId, privateKey, useSandbox
    });
    return {
      success: true,
      invitations: response.data?.content ?? [],
      totalElements: response.data?.totalElements ?? 0,
      totalPages: response.data?.totalPages ?? 0,
      page: response.data?.number ?? page,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/** Full detail for one invitation, including the link. */
export async function getInvitation({ invitationId, partnerId, privateKey, useSandbox = true }) {
  if (invitationId === undefined || invitationId === null) {
    throw new Error('invitationId is required');
  }
  try {
    const response = await isvRequest({
      method: 'get', path: `/isv/invitations/${invitationId}`, partnerId, privateKey, useSandbox
    });
    return {
      success: true,
      invitation: response.data,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/** Cancel a PENDING invitation. The link stops working immediately. */
export async function cancelInvitation({ invitationId, partnerId, privateKey, useSandbox = true }) {
  if (invitationId === undefined || invitationId === null) {
    throw new Error('invitationId is required');
  }
  try {
    const response = await isvRequest({
      method: 'delete', path: `/isv/invitations/${invitationId}`, partnerId, privateKey, useSandbox
    });
    return {
      success: true,
      invitationId,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

const AUTH_PROPERTIES = {
  partnerId: {
    type: 'string',
    description: 'ISV partner ID. Uses PAYWARE_PARTNER_ID env var as default.'
  },
  privateKey: {
    type: 'string',
    description: 'RSA private key for JWT signing. Uses the environment-specific key as default.'
  },
  useSandbox: {
    type: 'boolean',
    description: 'Use sandbox environment for testing',
    default: true
  }
};

function resolveAuth(args) {
  const partnerId = args.partnerId || getPartnerIdSafe();
  const privateKey = args.privateKey || getPrivateKeySafe(args.useSandbox ?? true);
  if (!partnerId) throw new Error("Partner ID is required. Provide 'partnerId' or set PAYWARE_PARTNER_ID.");
  if (!privateKey) throw new Error("Private key is required. Provide 'privateKey' or set PAYWARE_PRIVATE_KEY.");
  return { partnerId, privateKey, useSandbox: args.useSandbox ?? true };
}

function errorText(title, result) {
  return `❌ **${title}**

- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.errorCode || 'N/A'}
${result.error.correlationId ? `- Correlation ID: ${result.error.correlationId}` : ''}
${result.error.guidance ? `\n${result.error.guidance}` : ''}

**Timestamp:** ${result.timestamp}`;
}

export const createInvitationTool = {
  name: 'payware_isv_create_invitation',
  description: `Invite a merchant to join payware through this ISV. **This is the start of the ISV onboarding flow.**

**Endpoint:** POST /isv/invitations -> 201 Created

⚠️ **payware sends no email. You must deliver the link.** The response carries an \`invitationLink\`,
and distributing it - email, SMS, in-app, a printed QR, whatever your channel is - is the ISV's
responsibility. Creating the invitation and stopping there means the merchant never hears about it.

**The type is auto-detected from the email**, and you do not choose it:
- **REGISTRATION** - the email is new to payware. The merchant registers and authorizes you in one flow.
- **AUTHORIZATION_ONLY** - a merchant with that email already exists. They are asked only to authorize
  you, not to register again.

Everything except \`email\` is optional and pre-fills the merchant's form. Pre-filling is worth the
effort: it is the difference between a merchant confirming details and a merchant typing them.

💡 **\`jurisdictionCode: "BG"\` + \`registeredId\` auto-populates from the Bulgarian commercial
registry** - company name, address and legal form arrive without the merchant typing anything. Only
Bulgaria has this today.

💡 **\`legalFormId\` and \`businessActivityId\` are ids, not text.** Get them from
\`payware_reference_lookup\` (datasets \`legal-forms\` and \`business-activities\`) - and note that
legal forms are jurisdiction-specific, so fetch them for the merchant's own jurisdiction.

**409 responses are meaningful, not transient:** a pending invitation already exists for that email,
or the merchant has already authorized you. Neither is fixed by retrying - list the invitations and
look at what is already there.

**After the merchant accepts,** you hold an authorization and can obtain the OAuth2 token the
on-behalf tools need with \`payware_authorization_oauth2_obtain_token\`.`,

  inputSchema: {
    type: 'object',
    required: ['email'],
    properties: {
      email: {
        type: 'string',
        description: "Merchant's email address. REQUIRED, and it decides the invitation type: unknown email -> REGISTRATION, existing merchant -> AUTHORIZATION_ONLY.",
        format: 'email',
        maxLength: 254
      },
      phone: { type: 'string', description: "Merchant's phone number, e.g. +35912345678", maxLength: 20 },
      contactName: { type: 'string', description: "Merchant contact's first name", maxLength: 100 },
      contactSurname: { type: 'string', description: "Merchant contact's surname", maxLength: 100 },
      companyName: { type: 'string', description: 'Company legal name', maxLength: 255 },
      vatId: { type: 'string', description: 'VAT identification number, e.g. BG123456789', maxLength: 50 },
      registeredId: {
        type: 'string',
        description: 'Company registration ID (EIK in Bulgaria). Combined with jurisdictionCode "BG" this auto-populates the company details from the Bulgarian commercial registry.',
        maxLength: 50
      },
      street: { type: 'string', description: 'Street address', maxLength: 255 },
      streetNumber: { type: 'string', description: 'Street number', maxLength: 20 },
      zip: { type: 'string', description: 'ZIP / postal code', maxLength: 20 },
      city: { type: 'string', description: 'City', maxLength: 100 },
      legalFormId: {
        type: 'integer',
        description: "Legal form id from payware_reference_lookup (dataset 'legal-forms'). Jurisdiction-specific - fetch for the merchant's jurisdiction, not yours."
      },
      businessActivityId: {
        type: 'integer',
        description: "Business activity id from payware_reference_lookup (dataset 'business-activities')."
      },
      jurisdictionCode: {
        type: 'string',
        description: "ISO 3166-1 alpha-2 country code, e.g. BG. Two letters. 'BG' plus registeredId triggers Bulgarian commercial registry auto-population.",
        pattern: '^[a-zA-Z]{2}$'
      },
      preferredLanguageCode: {
        type: 'string',
        description: "Language for the invitation, e.g. bg or bg-BG. Valid values come from payware_reference_lookup (dataset 'languages').",
        maxLength: 5
      },
      ...AUTH_PROPERTIES
    }
  },

  async handler(args) {
    const auth = resolveAuth(args);
    const { partnerId, privateKey, useSandbox, ...rest } = { ...args, ...auth };
    const result = await createInvitation({ partnerId, privateKey, useSandbox, ...rest });

    if (!result.success) {
      return { content: [{ type: 'text', text: errorText('Failed to Create Invitation', result) }] };
    }

    const inv = result.invitation || {};
    return {
      content: [{
        type: 'text',
        text: `✅ **Invitation Created**

- Invitation ID: \`${inv.invitationId}\`
- Type: **${inv.type}** ${inv.type === 'REGISTRATION' ? '(new merchant - they register and authorize in one flow)' : '(existing merchant - they only authorize you)'}
- Status: ${inv.status}
- Email: ${inv.email}
- Expires: ${inv.expiresAt || 'N/A'}

## 🔗 Deliver this link to the merchant

\`\`\`
${inv.invitationLink}
\`\`\`

**payware does not send it.** Nothing further happens until the merchant opens this link, so send it
through your own channel now.

**Then:** once they accept, obtain the OAuth2 token with \`payware_authorization_oauth2_obtain_token\`
to start acting on their behalf.

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
      }]
    };
  }
};

export const listInvitationsTool = {
  name: 'payware_isv_list_invitations',
  description: `List the merchant invitations this ISV has created, newest first.

**Endpoint:** GET /isv/invitations - paginated

**Use it to answer "what happened to that invitation":** filter by \`PENDING\` to find merchants who
have not acted yet and may need the link re-sent, or by \`COMPLETED\` to find merchants you can now
obtain a token for.

**Statuses:** ${INVITATION_STATUSES.map(s => `\`${s}\``).join(', ')}. Only \`PENDING\` ones can be cancelled.

**Paging:** zero-based \`page\`, \`size\` up to 100 (larger values are capped, not rejected).`,

  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'array',
        description: 'Filter by one or more statuses. Omit for all.',
        items: { type: 'string', enum: INVITATION_STATUSES }
      },
      page: { type: 'integer', description: 'Page number, zero-based', minimum: 0, default: 0 },
      size: { type: 'integer', description: 'Page size, max 100', minimum: 1, maximum: 100, default: 20 },
      ...AUTH_PROPERTIES
    }
  },

  async handler(args) {
    const auth = resolveAuth(args);
    const result = await listInvitations({
      status: args.status, page: args.page ?? 0, size: args.size ?? 20, ...auth
    });

    if (!result.success) {
      return { content: [{ type: 'text', text: errorText('Failed to List Invitations', result) }] };
    }

    const emoji = { PENDING: '⏳', COMPLETED: '✅', EXPIRED: '⌛', CANCELLED: '🚫' };
    const rows = result.invitations.map(inv =>
      `${emoji[inv.status] || '•'} \`${inv.invitationId}\` ${inv.email} - **${inv.status}** (${inv.type})${inv.companyName ? ` - ${inv.companyName}` : ''}`
    ).join('\n');

    return {
      content: [{
        type: 'text',
        text: `📨 **Invitations** - page ${result.page + 1} of ${Math.max(result.totalPages, 1)}, ${result.totalElements} total

${rows || 'No invitations match this filter.'}

**Status meanings:** ⏳ PENDING - link sent, merchant has not acted. ✅ COMPLETED - merchant accepted;
obtain a token with \`payware_authorization_oauth2_obtain_token\`. ⌛ EXPIRED - the link lapsed; create
a new invitation. 🚫 CANCELLED - withdrawn by you.

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
      }]
    };
  }
};

export const getInvitationTool = {
  name: 'payware_isv_get_invitation',
  description: `Get full details of one invitation, including its link and the merchant data it pre-fills.

**Endpoint:** GET /isv/invitations/{invitationId}

**This is how you recover an invitation link** you no longer have - the link is not derivable from
the id, so re-reading the invitation is the only way to get it back short of creating a new one.

**404** means no invitation with that id belongs to this ISV. Invitations are scoped to their
creator, so another ISV's id reads as not-found rather than as forbidden.`,

  inputSchema: {
    type: 'object',
    required: ['invitationId'],
    properties: {
      invitationId: { type: 'integer', description: 'The invitation id, from payware_isv_list_invitations or the create response.' },
      ...AUTH_PROPERTIES
    }
  },

  async handler(args) {
    const auth = resolveAuth(args);
    const result = await getInvitation({ invitationId: args.invitationId, ...auth });

    if (!result.success) {
      return { content: [{ type: 'text', text: errorText('Failed to Get Invitation', result) }] };
    }

    const inv = result.invitation || {};
    return {
      content: [{
        type: 'text',
        text: `📨 **Invitation \`${inv.invitationId}\`**

- Status: **${inv.status}**
- Type: ${inv.type}
- Email: ${inv.email}
- Company: ${inv.companyName || '(not pre-filled)'}
- Expires: ${inv.expiresAt || 'N/A'}

${inv.invitationLink ? `## 🔗 Invitation link

\`\`\`
${inv.invitationLink}
\`\`\`
` : ''}
**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
      }]
    };
  }
};

export const cancelInvitationTool = {
  name: 'payware_isv_cancel_invitation',
  description: `Cancel a PENDING invitation. **The link stops working immediately.**

**Endpoint:** DELETE /isv/invitations/{invitationId} -> 204 No Content

**Only PENDING invitations can be cancelled.** A COMPLETED, EXPIRED or already-CANCELLED one answers
**409** - and for a COMPLETED one that is the right answer, not an obstacle: the merchant has already
registered and authorized you, and cancelling the invitation would not undo either. To end an
existing relationship the merchant revokes the authorization from their portal; revocation is theirs
to make and is final, so a new invitation cannot restore it.

**Cancel when:** the invitation went to the wrong address, or the deal is off. Not as a way to
"resend" - create a fresh invitation for that.`,

  inputSchema: {
    type: 'object',
    required: ['invitationId'],
    properties: {
      invitationId: { type: 'integer', description: 'The invitation id to cancel. Must currently be PENDING.' },
      ...AUTH_PROPERTIES
    }
  },

  async handler(args) {
    const auth = resolveAuth(args);
    const result = await cancelInvitation({ invitationId: args.invitationId, ...auth });

    if (!result.success) {
      const extra = result.error.status === 409
        ? '\n\n**409 means it is not PENDING.** Read it with `payware_isv_get_invitation` to see its actual status - a COMPLETED invitation cannot be cancelled, and cancelling would not revoke the authorization anyway.'
        : '';
      return { content: [{ type: 'text', text: errorText('Failed to Cancel Invitation', result) + extra }] };
    }

    return {
      content: [{
        type: 'text',
        text: `🚫 **Invitation \`${result.invitationId}\` cancelled**

The invitation link is invalid from now on. If the merchant still needs to be onboarded, create a
fresh invitation with \`payware_isv_create_invitation\` and deliver the new link.

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
      }]
    };
  }
};

export const isvInvitationTools = [
  createInvitationTool,
  listInvitationsTool,
  getInvitationTool,
  cancelInvitationTool
];
