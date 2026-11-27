import {
	Button,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@gospeak/components";
import PasswordChangeForm from "@/components/form/PasswordChangeForm";

export interface ForcePasswordChangeModalProps {
	open: boolean;
	onClose: () => void;
	onSkip?: () => void;
	onSubmit: (values: {
		username?: string;
		oldPassword?: string;
		newPassword: string;
		name?: string;
	}) => Promise<void>;
}

export default function ForcePasswordChangeModal({
	open,
	onClose,
	onSkip,
	onSubmit,
}: ForcePasswordChangeModalProps) {
	if (!open) return null;

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>修改密码</DialogTitle>
				</DialogHeader>
				<p className="text-muted-foreground text-sm">
					检测到您使用的是默认密码，建议修改后继续；也可以跳过，暂不修改。
				</p>
				<PasswordChangeForm
					showOldPassword={false}
					showName={true}
					submitText="修改密码"
					onSubmit={onSubmit}
				/>
				{onSkip && (
					<Button
						type="button"
						variant="ghost"
						className="mt-2 w-full"
						onClick={onSkip}
					>
						跳过，暂不修改
					</Button>
				)}
			</DialogContent>
		</Dialog>
	);
}
