import { AnimatedTestimonials } from "@/components/ui/animated-testimonials";

export default function AnimatedTestimonialsDemo() {
  const testimonials = [
    {
      quote:
        "مجموعة راقية مناسبة للضيافة اليومية والعزومات. الفكرة هنا أن العميل يرى family كاملة من الشكل نفسه بدل صورة واحدة فقط، ثم ينتقل لتفاصيل الاختيارات المتاحة داخل المنتج.",
      name: "LEIA COLLECTION",
      designation: "Variant-heavy showcase for tea glasses",
      src: "https://ik.imagekit.io/HOG/products/uhaAGWTuTxdX5j8uewhd/variants/680678591491_variant_1_1_fQja9FlIP.png",
    },
    {
      quote:
        "التأثير مناسب عندما يكون عندنا product line واحدة بألوان أو أشكال متعددة. بدل flip داخل الكارت، هنا المستخدم يتصفح variant stories الكبيرة بشكل أهدأ وأكثر فخامة.",
      name: "LUNA SERIES",
      designation: "Premium color variants with strong visual identity",
      src: "https://ik.imagekit.io/HOG/products/YnCMU7GrojO0BoTvceN8/variants/8693357546998_variant_1_1_E-Zx0j3Sc.png",
    },
    {
      quote:
        "مفيد جدًا لو أردنا section مستقل لعرض المجموعات المميزة أو collections الجديدة. ليس بديلًا مباشرًا لـ product grid، لكنه أقوى بكثير كقسم تقديم بصري قبل الكتالوج.",
      name: "AMORE LINE",
      designation: "Hero collection for luxury storefront storytelling",
      src: "https://ik.imagekit.io/HOG/products/L2zwRnOVsDLcNWUo26sl/variants/680678591651_variant_1_1_BC4bAtcOn.png",
    },
    {
      quote:
        "الترتيب المتحرك بين الصور يعطي إحساس catalog premium. لو عجبك الاتجاه يمكن تحويل النصوص هنا لاحقًا إلى أسماء variant فعلية وسعر أو category بدل الوصف الحالي.",
      name: "NOVA EDIT",
      designation: "Animated sequence for curated product families",
      src: "https://ik.imagekit.io/HOG/products/aM5z1ebd1BzNWhnAW5u7/variants/680678591866_variant_1_1_udRXTfoi1.png",
    },
    {
      quote:
        "هذا النوع من المكونات ينجح عندما نستخدمه كمنطقة spotlight للمنتجات ذات الصور القوية. بالنسبة لبيت الزجاج، مكانه الأنسب section curated collections وليس شبكة المنتجات اليومية نفسها.",
      name: "BARREL FEATURE",
      designation: "Best as a curated spotlight rather than main catalog grid",
      src: "https://ik.imagekit.io/HOG/products/BkDQy2ex8rM5QiEUjqPo/variants/680678572445_variant_1_1_wyKKYjFc8.png",
    },
  ];
  return <AnimatedTestimonials testimonials={testimonials} />;
}
