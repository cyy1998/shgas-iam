CREATE TABLE "custom_attribute_definition" (
	"id" serial PRIMARY KEY,
	"entity_type" varchar(16) NOT NULL,
	"code" varchar(64) NOT NULL,
	"value_type" varchar(16) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"description" text,
	"order_num" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"options" jsonb DEFAULT '[]' NOT NULL,
	"create_time" timestamp DEFAULT now() NOT NULL,
	"update_time" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_attribute_definition_entity_code_unique" UNIQUE("entity_type","code"),
	CONSTRAINT "custom_attribute_definition_entity_type_check" CHECK ("entity_type" IN ('user', 'organization', 'position')),
	CONSTRAINT "custom_attribute_definition_code_check" CHECK ("code" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "custom_attribute_definition_value_type_check" CHECK ("value_type" IN ('text', 'number', 'boolean', 'date', 'single_select', 'text_list')),
	CONSTRAINT "custom_attribute_definition_options_check" CHECK (jsonb_typeof("options") = 'array' AND ("value_type" = 'single_select' OR "options" = '[]'::jsonb))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "custom_attributes" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_custom_attributes_object_check" CHECK (jsonb_typeof("custom_attributes") = 'object');