Design or troubleshoot an automation workflow for the agency.

Ask the user for the following if not already provided:
- Workflow goal: what should be automated and what is the desired outcome
- Trigger: what starts the workflow (schedule, form submission, new record, manual, etc.)
- Tools/platforms involved (e.g., Make, n8n, Airtable, Claude API, Buffer, Google Sheets, Gmail)
- Any existing workflow steps or context
- Whether this is a new workflow design or debugging an existing one

Then produce the following:
- Plain-English description of what the workflow does
- Step-by-step module sequence using the tools specified
- Inputs and outputs for each step
- Error handling recommendations
- Estimated API or tool cost per run if Claude API is involved
- A suggested file name and location under /workflows/

Follow these design principles:
- Favor simplicity — fewest steps that achieve the goal reliably
- Every workflow must have at least one error notification step
- Claude API model choice: haiku-4-5 for bulk/speed tasks, sonnet-4-6 for client-facing quality outputs
- Reference existing workflow files in /workflows/ if the new workflow connects to them

Format output as a ready-to-save workflow doc matching the structure of existing files in /workflows/.
