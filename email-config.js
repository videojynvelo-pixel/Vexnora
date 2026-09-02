/* Jynvelo email OTP
   1. https://www.emailjs.com પર મફત એકાઉન્ટ બનાવો
   2. Add Email Service → Gmail (Connect)
   3. Email Templates → Create template
      To: {{to_email}}
      Subject: Jynvelo OTP
      Content: Your OTP is {{otp}}
   4. Account → General → Public Key કોપી
   5. નીચે ત્રણ વેલ્યુ ભરો, ફાઇલ GitHub પર અપડેટ કરો
*/
window.JYNVElo_EMAIL = {
  publicKey: "",
  serviceId: "",
  templateId: ""
};
