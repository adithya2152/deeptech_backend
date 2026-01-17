/**
 * Service for generating contract document content from templates
 */

/**
 * Generate service agreement HTML content
 */
export function generateServiceAgreement(contractData) {
    const {
        buyerName,
        expertName,
        projectTitle,
        projectDescription,
        expectedOutcome,
        domain,
        engagementModel,
        paymentTerms,
        startDate,
        totalAmount,
    } = contractData;

    const formattedStartDate = new Date(startDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let compensationSection = '';

    switch (engagementModel) {
        case 'daily':
            compensationSection = `
        <p><strong>Engagement Model:</strong> Daily Rate</p>
        <ul>
          <li>Daily Rate: $${paymentTerms.daily_rate?.toLocaleString() || 'N/A'}</li>
          <li>Estimated Duration: ${paymentTerms.total_days || 'N/A'} days</li>
          <li>Maximum Contract Value: $${totalAmount?.toLocaleString() || 'N/A'}</li>
        </ul>
      `;
            break;
        case 'sprint':
            compensationSection = `
        <p><strong>Engagement Model:</strong> Sprint-Based</p>
        <ul>
          <li>Sprint Rate: $${paymentTerms.sprint_rate?.toLocaleString() || 'N/A'}</li>
          <li>Sprint Duration: ${paymentTerms.sprint_duration_days || 'N/A'} days</li>
          <li>Total Sprints: ${paymentTerms.total_sprints || 'N/A'}</li>
          <li>Total Contract Value: $${totalAmount?.toLocaleString() || 'N/A'}</li>
        </ul>
      `;
            break;
        case 'fixed':
            compensationSection = `
        <p><strong>Engagement Model:</strong> Fixed Price</p>
        <ul>
          <li>Fixed Price: $${totalAmount?.toLocaleString() || paymentTerms.total_amount?.toLocaleString() || 'N/A'}</li>
        </ul>
      `;
            break;
        case 'hourly':
            compensationSection = `
        <p><strong>Engagement Model:</strong> Hourly Rate</p>
        <ul>
          <li>Hourly Rate: $${paymentTerms.hourly_rate?.toLocaleString() || 'N/A'}/hour</li>
          <li>Estimated Hours: ${paymentTerms.estimated_hours || 'As needed'}</li>
          ${paymentTerms.estimated_hours ? `<li>Estimated Total: $${(paymentTerms.hourly_rate * paymentTerms.estimated_hours).toLocaleString()}</li>` : ''}
        </ul>
      `;
            break;
        default:
            compensationSection = `<p><strong>Engagement Model:</strong> ${engagementModel}</p>`;
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { 
      font-family: 'Georgia', serif; 
      line-height: 1.6; 
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    h1 { 
      text-align: center; 
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h2 { 
      color: #555; 
      margin-top: 30px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 10px;
    }
    .parties { 
      background: #f9f9f9; 
      padding: 20px; 
      border-radius: 8px;
      margin: 20px 0;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
      gap: 40px;
    }
    .signature-block {
      flex: 1;
      border-top: 2px solid #333;
      padding-top: 20px;
    }
    .signature-line {
      border-bottom: 1px solid #999;
      min-height: 40px;
      margin: 10px 0;
    }
    ul { margin-left: 20px; }
    li { margin: 5px 0; }
  </style>
</head>
<body>
  <h1>SERVICE AGREEMENT</h1>
  
  <div class="parties">
    <h2>1. PARTIES</h2>
    <p><strong>Client ("Buyer"):</strong> ${buyerName || '[Buyer Name]'}</p>
    <p><strong>Contractor ("Expert"):</strong> ${expertName || '[Expert Name]'}</p>
    <p><strong>Effective Date:</strong> ${formattedStartDate}</p>
  </div>

  <h2>2. PROJECT DETAILS</h2>
  <p><strong>Project Title:</strong> ${projectTitle || '[Project Title]'}</p>
  <p><strong>Description:</strong> ${projectDescription || '[Project Description]'}</p>
  ${expectedOutcome ? `<p><strong>Expected Outcome:</strong> ${expectedOutcome}</p>` : ''}
  ${domain ? `<p><strong>Domain:</strong> ${domain}</p>` : ''}

  <h2>3. COMPENSATION</h2>
  ${compensationSection}
  <p><strong>Payment Terms:</strong></p>
  <ul>
    <li>All payments will be processed through the DeepTech platform escrow system</li>
    <li>Funds will be released to the Contractor upon work approval by the Client</li>
    <li>Platform fees are deducted from payments as per DeepTech's terms of service</li>
  </ul>

  <h2>4. INTELLECTUAL PROPERTY</h2>
  <p>All work product, deliverables, inventions, and intellectual property created by the Contractor 
  during the course of this engagement shall become the sole and exclusive property of the Client 
  upon full payment of all agreed compensation.</p>
  <p>The Contractor agrees to execute any documents reasonably necessary to confirm the Client's 
  ownership of such intellectual property.</p>

  <h2>5. LIABILITY & RESPONSIBILITIES</h2>
  <p><strong>Contractor agrees to:</strong></p>
  <ul>
    <li>Deliver work as specified in the project requirements</li>
    <li>Communicate progress and any issues promptly</li>
    <li>Maintain professional standards throughout the engagement</li>
  </ul>
  <p><strong>Client agrees to:</strong></p>
  <ul>
    <li>Provide clear requirements and timely feedback</li>
    <li>Fund escrow as required before work commences</li>
    <li>Review and approve/reject deliverables within reasonable timeframes</li>
  </ul>

  <h2>6. TERMINATION</h2>
  <p>Either party may terminate this agreement with written notice through the DeepTech platform. 
  Upon termination:</p>
  <ul>
    <li>Client shall pay for all approved work completed to date</li>
    <li>Contractor shall deliver all completed work product</li>
    <li>Any escrowed funds shall be handled per DeepTech's dispute resolution process</li>
  </ul>

  <h2>7. DISPUTE RESOLUTION</h2>
  <p>In the event of any dispute arising from this agreement, both parties agree to first attempt 
  resolution through DeepTech's built-in dispute resolution system. If the dispute cannot be 
  resolved through this process, the parties may pursue other legal remedies.</p>

  <h2>8. ELECTRONIC SIGNATURES</h2>
  <p>Both parties acknowledge and agree that electronic signatures affixed to this agreement shall 
  have the same legal effect as handwritten signatures. By signing electronically, each party 
  confirms they have read, understood, and agree to the terms of this agreement.</p>

  <div class="signatures">
    <div class="signature-block">
      <p><strong>CLIENT</strong></p>
      <p>Name: <span id="buyer-signature">{{buyer_signature}}</span></p>
      <div class="signature-line"></div>
      <p>Date: <span id="buyer-date">{{buyer_date}}</span></p>
    </div>
    <div class="signature-block">
      <p><strong>CONTRACTOR</strong></p>
      <p>Name: <span id="expert-signature">{{expert_signature}}</span></p>
      <div class="signature-line"></div>
      <p>Date: <span id="expert-date">{{expert_date}}</span></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate NDA HTML content
 */
export function generateNda(contractData) {
    const {
        buyerName,
        expertName,
        projectTitle,
        startDate,
        customContent,
    } = contractData;

    const formattedStartDate = new Date(startDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { 
      font-family: 'Georgia', serif; 
      line-height: 1.6; 
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    h1 { 
      text-align: center; 
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h2 { 
      color: #555; 
      margin-top: 30px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 10px;
    }
    .parties { 
      background: #f9f9f9; 
      padding: 20px; 
      border-radius: 8px;
      margin: 20px 0;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
      gap: 40px;
    }
    .signature-block {
      flex: 1;
      border-top: 2px solid #333;
      padding-top: 20px;
    }
    .custom-content {
      background: #fafafa;
      border-left: 4px solid #666;
      padding: 15px 20px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>NON-DISCLOSURE AGREEMENT</h1>
  
  <div class="parties">
    <p><strong>Disclosing Party:</strong> ${buyerName || '[Buyer Name]'} ("Client")</p>
    <p><strong>Receiving Party:</strong> ${expertName || '[Expert Name]'} ("Contractor")</p>
    <p><strong>Effective Date:</strong> ${formattedStartDate}</p>
    <p><strong>Project:</strong> ${projectTitle || '[Project Title]'}</p>
  </div>

  <h2>1. DEFINITION OF CONFIDENTIAL INFORMATION</h2>
  <p>"Confidential Information" means any and all non-public information disclosed by the Client 
  to the Contractor, including but not limited to:</p>
  <ul>
    <li>Business strategies, plans, and financial information</li>
    <li>Technical data, trade secrets, and know-how</li>
    <li>Product designs, specifications, and prototypes</li>
    <li>Customer lists and vendor relationships</li>
    <li>Any other proprietary information marked as confidential</li>
  </ul>

  ${customContent ? `
  <h2>2. ADDITIONAL CONFIDENTIAL MATTERS</h2>
  <div class="custom-content">
    ${customContent}
  </div>
  ` : ''}

  <h2>${customContent ? '3' : '2'}. OBLIGATIONS</h2>
  <p>The Contractor agrees to:</p>
  <ul>
    <li>Hold all Confidential Information in strict confidence</li>
    <li>Not disclose Confidential Information to any third party without prior written consent</li>
    <li>Use Confidential Information solely for the purpose of the project</li>
    <li>Take reasonable measures to protect the confidentiality of the information</li>
    <li>Return or destroy all Confidential Information upon project completion or Client's request</li>
  </ul>

  <h2>${customContent ? '4' : '3'}. EXCLUSIONS</h2>
  <p>Confidential Information does not include information that:</p>
  <ul>
    <li>Was publicly available prior to disclosure</li>
    <li>Becomes publicly available through no fault of the Contractor</li>
    <li>Was rightfully in the Contractor's possession prior to disclosure</li>
    <li>Is independently developed by the Contractor without use of Confidential Information</li>
    <li>Is required to be disclosed by law or legal process</li>
  </ul>

  <h2>${customContent ? '5' : '4'}. TERM</h2>
  <p>This NDA and the obligations herein shall continue for a period of two (2) years from the 
  date of disclosure of any Confidential Information, or until the Confidential Information 
  no longer qualifies as confidential, whichever occurs first.</p>

  <h2>${customContent ? '6' : '5'}. REMEDIES</h2>
  <p>The Contractor acknowledges that any breach of this Agreement may cause irreparable harm 
  to the Client, and that monetary damages may be inadequate. The Client shall be entitled to 
  seek equitable relief, including injunction and specific performance, in addition to other 
  available remedies.</p>

  <h2>${customContent ? '7' : '6'}. ELECTRONIC SIGNATURES</h2>
  <p>Both parties acknowledge that electronic signatures shall have the same legal effect as 
  handwritten signatures.</p>

  <div class="signatures">
    <div class="signature-block">
      <p><strong>DISCLOSING PARTY (CLIENT)</strong></p>
      <p>Name: <span id="buyer-signature">{{buyer_signature}}</span></p>
      <p>Date: <span id="buyer-date">{{buyer_date}}</span></p>
    </div>
    <div class="signature-block">
      <p><strong>RECEIVING PARTY (CONTRACTOR)</strong></p>
      <p>Name: <span id="expert-signature">{{expert_signature}}</span></p>
      <p>Date: <span id="expert-date">{{expert_date}}</span></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Replace signature placeholders with actual values
 */
export function fillSignatures(content, signatures) {
    let filled = content;

    if (signatures.buyerName) {
        filled = filled.replace('{{buyer_signature}}', signatures.buyerName);
    }
    if (signatures.buyerDate) {
        filled = filled.replace('{{buyer_date}}', signatures.buyerDate);
    }
    if (signatures.expertName) {
        filled = filled.replace('{{expert_signature}}', signatures.expertName);
    }
    if (signatures.expertDate) {
        filled = filled.replace('{{expert_date}}', signatures.expertDate);
    }

    return filled;
}

export default {
    generateServiceAgreement,
    generateNda,
    fillSignatures,
};
