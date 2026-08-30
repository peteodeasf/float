"""review comments

A free-text box per situation. The marks say which suggestions are wrong; the prose says why, and
why is what changes the feature.

Not destructive: one new table.

Revision ID: f2c7a13e845b
Revises: d9a4f60b2e15
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f2c7a13e845b'
down_revision = 'd9a4f60b2e15'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'review_comments',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('reviewer_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_key', sa.String(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['reviewer_id'], ['review_reviewers.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('uq_review_comments_item', 'review_comments', ['reviewer_id', 'item_key'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_review_comments_item', table_name='review_comments')
    op.drop_table('review_comments')
