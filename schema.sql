-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.answer_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  vote_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT answer_votes_pkey PRIMARY KEY (id),
  CONSTRAINT answer_votes_answer_id_doubt_answers_id_fk FOREIGN KEY (answer_id) REFERENCES public.doubt_answers(id)
);
CREATE TABLE public.blogs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  excerpt text,
  author_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT blogs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bookmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bookmark_type text NOT NULL,
  project_id uuid,
  expert_id uuid,
  post_id uuid,
  blog_id uuid,
  task_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bookmarks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  expert_id uuid NOT NULL,
  engagement_model USER-DEFINED NOT NULL,
  payment_terms jsonb NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::contract_status_enum,
  nda_signed_at timestamp without time zone,
  nda_signature_name text,
  nda_ip_address text,
  start_date date NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT contracts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  participant_1 uuid NOT NULL,
  participant_2 uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_message_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.doubt_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doubt_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  attachments json DEFAULT '[]'::json,
  upvotes integer DEFAULT 0,
  downvotes integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT doubt_answers_pkey PRIMARY KEY (id),
  CONSTRAINT doubt_answers_doubt_id_doubts_id_fk FOREIGN KEY (doubt_id) REFERENCES public.doubts(id)
);
CREATE TABLE public.doubts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  tags json DEFAULT '[]'::json,
  domain text,
  attachments json DEFAULT '[]'::json,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT doubts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.experts (
  id uuid NOT NULL,
  domains ARRAY NOT NULL,
  experience_summary text NOT NULL,
  hourly_rate_advisory integer NOT NULL,
  hourly_rate_architecture integer NOT NULL,
  hourly_rate_execution integer NOT NULL,
  vetting_status text NOT NULL DEFAULT 'pending'::text CHECK (vetting_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'info_requested'::text])),
  vetting_level text CHECK (vetting_level = ANY (ARRAY['general'::text, 'advanced'::text, 'deep_tech_verified'::text])),
  total_hours integer DEFAULT 0,
  rating numeric DEFAULT 0,
  review_count integer DEFAULT 0,
  availability jsonb DEFAULT '[]'::jsonb,
  patents ARRAY DEFAULT '{}'::text[],
  papers ARRAY DEFAULT '{}'::text[],
  products ARRAY DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT experts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  giver_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  rating integer NOT NULL,
  message text NOT NULL,
  is_anonymous boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  expert_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  amount numeric NOT NULL,
  total_hours numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text])),
  week_start_date date,
  week_end_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  invoice_type text DEFAULT 'periodic'::text CHECK (invoice_type = ANY (ARRAY['periodic'::text, 'sprint'::text, 'milestone'::text])),
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_expert_id_fk FOREIGN KEY (expert_id) REFERENCES public.experts(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  attachments json DEFAULT '[]'::json,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  author_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT posts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profile_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  organization text NOT NULL,
  credential_id text,
  issue_date date NOT NULL,
  expiry_date date,
  does_not_expire boolean DEFAULT false,
  description text,
  proof_image_url text,
  credential_link text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_credentials_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profile_education (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  school text NOT NULL,
  degree text NOT NULL,
  field_of_study text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  is_current boolean DEFAULT false,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_education_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profile_experience (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  title text NOT NULL,
  company text NOT NULL,
  description text,
  start_date date NOT NULL,
  end_date date,
  is_current boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_experience_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profile_languages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  language_name text NOT NULL,
  proficiency text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_languages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profile_payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  method_type text NOT NULL,
  paypal_email text,
  stripe_email text,
  upi_id text,
  card_number text,
  card_expiry text,
  card_cvv text,
  cardholder_name text,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_payment_methods_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profile_skills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  domain text NOT NULL,
  subdomain text,
  skill_names json NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_skills_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profile_social_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  linkedin text,
  github text,
  twitter text,
  website text,
  other_links json,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_social_links_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email character varying NOT NULL UNIQUE,
  first_name character varying,
  last_name character varying,
  role character varying DEFAULT 'user'::character varying CHECK (role::text = ANY (ARRAY['buyer'::text, 'expert'::text, 'admin'::text])),
  email_verified boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  last_login timestamp without time zone,
  last_logout timestamp without time zone,
  avatar_url text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.project_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  expert_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  attachments json DEFAULT '[]'::json,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_updates_pkey PRIMARY KEY (id),
  CONSTRAINT project_updates_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  buyer_id uuid NOT NULL,
  expert_id uuid,
  status text NOT NULL DEFAULT 'draft'::text,
  budget_min numeric,
  budget_max numeric,
  deadline date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  domain text,
  trl_level text,
  risk_categories ARRAY,
  expected_outcome text,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.experts(id)
);
CREATE TABLE public.proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  expert_id uuid NOT NULL,
  quote_amount numeric NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  duration_days integer,
  engagement_model USER-DEFINED NOT NULL,
  rate numeric NOT NULL,
  sprint_count integer,
  CONSTRAINT proposals_pkey PRIMARY KEY (id),
  CONSTRAINT proposals_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.tasklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tasklists_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  due_date date,
  status text NOT NULL DEFAULT 'pending'::text,
  tasklist_id uuid NOT NULL,
  assigned_to text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_tasklist_id_tasklists_id_fk FOREIGN KEY (tasklist_id) REFERENCES public.tasklists(id)
);
CREATE TABLE public.update_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL,
  user_id uuid NOT NULL,
  comment_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT update_comments_pkey PRIMARY KEY (id),
  CONSTRAINT update_comments_update_id_project_updates_id_fk FOREIGN KEY (update_id) REFERENCES public.project_updates(id)
);
CREATE TABLE public.work_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  type USER-DEFINED NOT NULL,
  checklist jsonb,
  problems_faced text,
  sprint_number integer,
  evidence jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT work_logs_pkey PRIMARY KEY (id),
  CONSTRAINT work_logs_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id)
);