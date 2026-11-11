import { RegisterForm } from "../AuthForms";

export const metadata = { title: "Create account · GebetaSoccer" };

export default function RegisterPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Join GebetaSoccer</h1>
        <p className="mt-1 text-sm text-mist">Predict 10 matches a week. Top the table.</p>
      </div>
      <RegisterForm />
    </div>
  );
}
