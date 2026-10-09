#!/usr/bin/perl
# Baut data/pruefung.json aus den Einzeldateien data-src/pruefung/NN-name.json
# (Reihenfolge = Dateiname). Zählt die Wörter des lateinischen Textes.
# Danach: perl tools/verify_quellen.pl .cache/texte   (Wortlaut + Stelle prüfen!)
use strict; use warnings; use utf8; use JSON::PP;
binmode STDOUT, ':utf8';
my $root = do { my $d = __FILE__; $d =~ s{/tools/[^/]+$}{}; $d eq __FILE__ ? '.' : $d };
my @texts;
for my $f (sort glob "$root/data-src/pruefung/*.json") {
  open my $fh, '<:raw', $f or die "$f: $!";
  my $t = eval { decode_json(do { local $/; <$fh> }) } or die "Fehler in $f: $@";
  for (qw(id titel text quelle musteruebersetzung)) { die "$f: $_ fehlt\n" unless $t->{$_} }
  $t->{woerter} = scalar grep { /\p{L}/ } split /\s+/, $t->{text};
  push @texts, $t;
}
my $out = {
  format => 'latein-pruefungstexte-sammlung',
  hinweis => 'Eingebaute Prüfungstexte. Lateinische Texte nach The Latin Library (gemeinfrei), Wortlaut dort nachgeprüft. Einleitungen, Vokabelhilfen und Musterübersetzungen von Claude verfasst.',
  texte => \@texts,
};
open my $o, '>:raw', "$root/data/pruefung.json" or die;
print $o JSON::PP->new->utf8->canonical->encode($out);
close $o;
printf "Gebaut: %d Texte\n", scalar @texts;
printf "  %-22s %3d Wörter  %s %s\n", $_->{id}, $_->{woerter}, $_->{quelle}{autor}, $_->{quelle}{stelle} for @texts;
